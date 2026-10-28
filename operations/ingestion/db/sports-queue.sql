create table public.brand_pipeline (
  slug text primary key,
  display_name text not null,
  segment text not null,
  pipeline_state text not null check (pipeline_state in ('candidate','queued','testing','active','parked','blocked')),
  priority integer not null default 100,
  reason text not null,
  decision_source text not null,
  updated_at timestamptz not null default now()
);
alter table public.brand_pipeline enable row level security;
revoke all on public.brand_pipeline from public,anon,authenticated,service_role;
grant select on public.brand_pipeline to service_role;
insert into public.brand_pipeline(slug,display_name,segment,pipeline_state,priority,reason,decision_source) values
('nike','Nike','sports_and_casual','testing',10,'Children sports and casual pilot; classify per product','Adam 2026-10-28'),
('adidas','Adidas','sports_and_casual','testing',20,'Existing pilot plus Gazelle lifestyle comparison','Adam 2026-10-28'),
('puma','Puma','sports_and_casual','testing',30,'Explicitly requested children sports pilot','Adam 2026-10-28'),
('new-balance','New Balance','sports_and_casual','testing',40,'Similar sports brand with verified children range','Delegated queue sorting 2026-10-28'),
('asics','ASICS','sports_and_casual','testing',50,'Children indoor and running range','Delegated queue sorting 2026-10-28'),
('geggamoja','Geggamoja','children_specialist','active',60,'Existing authorized test source','Existing deployment'),
('reima','Reima','children_specialist','candidate',100,'Retained specialist candidate; no active source','Previous shortlist'),
('didriksons','Didriksons','outdoor_specialist','candidate',110,'Retained specialist candidate; no active source','Previous shortlist'),
('molo','Molo','children_specialist','candidate',120,'Retained specialist candidate; no active source','Previous shortlist'),
('zara','Zara Kids','large_fashion_chain','parked',900,'Explicitly parked; outside integration queue','Adam 2026-10-28'),
('mango','Mango Kids','large_fashion_chain','parked',910,'Explicitly parked; outside integration queue','Adam 2026-10-28'),
('next','Next','broad_fashion_chain','parked',920,'Broad chain deferred while sports is prioritized','Delegated queue sorting 2026-10-28'),
('cubus','Cubus','broad_fashion_chain','parked',930,'Broad chain deferred while sports is prioritized','Delegated queue sorting 2026-10-28'),
('nameit','Name It','broad_fashion_chain','parked',940,'Broad chain deferred while sports is prioritized','Delegated queue sorting 2026-10-28'),
('hm','H&M','large_fashion_chain','blocked',999,'Explicit exclusion remains in force','Adam explicit exclusion');
create view public.brand_integration_queue with (security_invoker=true) as
  select * from public.brand_pipeline where pipeline_state in ('queued','testing','active') order by priority,slug;
create view public.parked_brands with (security_invoker=true) as
  select * from public.brand_pipeline where pipeline_state in ('parked','blocked') order by priority,slug;
revoke all on public.brand_integration_queue,public.parked_brands from public,anon,authenticated;
grant select on public.brand_integration_queue,public.parked_brands to service_role;

create table public.product_usage_categories (
  code text primary key,display_name text not null,product_family text not null
);
insert into public.product_usage_categories values
('unknown','Ej klassificerad','unknown'),('lifestyle_footwear','Vardagsskor / sneakers','footwear'),
('football_footwear','Fotbollsskor','footwear'),('running_footwear','Löparskor','footwear'),
('indoor_footwear','Inomhusskor','footwear'),('basketball_footwear','Basketskor','footwear'),
('football_apparel','Fotbollskläder','apparel'),('training_apparel','Träningskläder','apparel'),
('casual_apparel','Vardagskläder','apparel');
alter table public.product_usage_categories enable row level security;
revoke all on public.product_usage_categories from public,anon,authenticated,service_role;
grant select on public.product_usage_categories to anon,authenticated,service_role;
create policy usage_taxonomy_read on public.product_usage_categories for select to anon,authenticated using (true);

alter table public.products
  add column wear_context text not null default 'unknown' check (wear_context in ('casual','sport','mixed','unknown')),
  add column sport_activities text[] not null default '{}' check (sport_activities <@ array['football','running','basketball','tennis','handball','volleyball','indoor_training','general_training']),
  add column usage_category text not null default 'unknown' references public.product_usage_categories(code),
  add column usage_classification jsonb not null default '{"state":"unclassified","evidence":[]}'::jsonb;
alter table public.product_ingest
  add column wear_context text not null default 'unknown' check (wear_context in ('casual','sport','mixed','unknown')),
  add column sport_activities text[] not null default '{}' check (sport_activities <@ array['football','running','basketball','tennis','handball','volleyball','indoor_training','general_training']),
  add column usage_category text not null default 'unknown' references public.product_usage_categories(code),
  add column usage_classification jsonb not null default '{"state":"unclassified","evidence":[]}'::jsonb;
create index products_usage_category on public.products(usage_category);
create index product_ingest_usage_queue on public.product_ingest(wear_context,usage_category,id) where review_status in ('pending','needs_review');
create index products_sport_activities on public.products using gin(sport_activities) where cardinality(sport_activities)>0;
create index product_ingest_usage_category on public.product_ingest(usage_category);

create function whool_private.brand_key(value text) returns text language sql immutable security invoker set search_path='' as $$
  select case lower(regexp_replace(value,'[^a-zA-Z0-9]','','g')) when 'adidasoriginals' then 'adidas'
    when 'nikesportswear' then 'nike' when 'newbalance' then 'new-balance' else lower(regexp_replace(value,'[^a-zA-Z0-9]','','g')) end;
$$;
revoke all on function whool_private.brand_key(text) from public,anon,authenticated;
grant execute on function whool_private.brand_key(text) to service_role;

create function whool_private.prepare_usage_context() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' and new.proposed_product ? 'wear_context' then
    new.wear_context:=new.proposed_product->>'wear_context';
    new.sport_activities:=array(select jsonb_array_elements_text(new.proposed_product->'sport_activities'));
    new.usage_category:=new.proposed_product->>'usage_category';
    new.usage_classification:=new.proposed_product->'usage_classification';
  elsif tg_op='UPDATE' and old.review_status in ('approved','rejected','published') and
    row(new.wear_context,new.sport_activities,new.usage_category,new.usage_classification) is distinct from
    row(old.wear_context,old.sport_activities,old.usage_category,old.usage_classification) then
    raise exception 'Final usage context requires a new observation';
  end if;
  if new.wear_context in ('sport','mixed') and cardinality(new.sport_activities)=0 then raise exception 'Sport context needs an activity'; end if;
  if new.wear_context in ('casual','unknown') and cardinality(new.sport_activities)>0 then raise exception 'Non-sport context cannot claim an activity'; end if;
  if new.wear_context<>'unknown' and (jsonb_typeof(new.usage_classification->'evidence') is distinct from 'array' or jsonb_array_length(new.usage_classification->'evidence')=0) then raise exception 'Usage context needs evidence'; end if;
  return new;
end;
$$;
create trigger ingest_usage_context before insert or update on public.product_ingest for each row execute function whool_private.prepare_usage_context();
revoke all on function whool_private.prepare_usage_context() from public,anon,authenticated;
grant execute on function whool_private.prepare_usage_context() to service_role;

alter table whool_private.ingest_sources drop constraint ingest_sources_retailer_check;
alter table whool_private.ingest_sources drop constraint ingest_sources_check;
alter table whool_private.ingest_sources add constraint ingest_sources_retailer_check check (retailer in ('stadium','ahlens','intersport'));
alter table whool_private.ingest_sources add constraint ingest_sources_check check
 ((retailer='stadium' and product_url like 'https://www.stadium.se/product/%') or
  (retailer='ahlens' and product_url like 'https://www.ahlens.se/produkter/barn/%') or
  (retailer='intersport' and product_url like 'https://www.intersport.se/products/%'));

create function whool_private.source_pipeline_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.brand_pipeline b where b.slug=whool_private.brand_key(new.brand) and b.pipeline_state in ('queued','testing','active')) then raise exception 'Brand is parked, blocked or outside integration queue'; end if;
  return new;
end;
$$;
create trigger source_pipeline_guard before insert or update on whool_private.ingest_sources for each row execute function whool_private.source_pipeline_guard();
revoke all on function whool_private.source_pipeline_guard() from public,anon,authenticated,service_role;

comment on column public.products.wear_context is 'Product-level intended use. Sport brand identity does not imply sport use; unknown until classified from evidence.';
comment on table public.brand_pipeline is 'Active integration decisions separated from retained parked/blocked candidates. Large fast-fashion chains deferred; H&M excluded.';
