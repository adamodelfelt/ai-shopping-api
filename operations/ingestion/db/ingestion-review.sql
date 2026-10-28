-- New scrape evidence is quarantined. Existing catalogue rows are not moved.
create schema if not exists whool_private;
revoke all on schema whool_private from public, anon, authenticated;
grant usage on schema whool_private to service_role;

create table public.scrape_runs (
  id uuid primary key default gen_random_uuid(),
  retailer text not null,
  collected_at timestamptz not null,
  complete boolean not null default false,
  scope text not null,
  expected_count integer check (expected_count >= 0),
  max_products integer not null default 50 check (max_products between 1 and 2000),
  parser_version text not null,
  created_at timestamptz not null default now()
);
create table public.product_ingest (
  id bigint generated always as identity primary key,
  run_id uuid references public.scrape_runs(id),
  retailer text not null,
  source_key text not null,
  source_url text,
  fetched_at timestamptz not null,
  last_seen_at timestamptz not null,
  observation_count integer not null default 1,
  raw_data jsonb not null check (jsonb_typeof(raw_data) = 'object'),
  proposed_product jsonb not null check (jsonb_typeof(proposed_product) = 'object'),
  content_hash text not null,
  base_product_hash text,
  validation_errors text[] not null default '{}',
  review_status text not null default 'pending' check (review_status in ('pending','needs_review','approved','rejected','published')),
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  approved_hash text,
  published_product_id bigint references public.products(id),
  created_at timestamptz not null default now(),
  unique (retailer, source_key, content_hash)
);
create index product_ingest_review_queue on public.product_ingest (review_status, retailer, id)
  where review_status in ('pending','needs_review','approved');
create index product_ingest_run on public.product_ingest (run_id, id);
create index product_ingest_product on public.product_ingest (published_product_id) where published_product_id is not null;
create index scrape_runs_retailer on public.scrape_runs (retailer, created_at desc);

create table whool_private.ingest_review_events (
  id bigint generated always as identity primary key,
  ingest_id bigint not null references public.product_ingest(id),
  action text not null,
  reviewer text not null,
  note text not null,
  content_hash text not null,
  created_at timestamptz not null default now()
);
create index ingest_review_events_ingest_id on whool_private.ingest_review_events (ingest_id,id);
alter table public.scrape_runs enable row level security;
alter table public.product_ingest enable row level security;
alter table whool_private.ingest_review_events enable row level security;
revoke all on public.scrape_runs, public.product_ingest from public, anon, authenticated;
revoke all on whool_private.ingest_review_events from public, anon, authenticated;
grant select,insert on public.scrape_runs to service_role;
grant select,insert,update on public.product_ingest to service_role;
grant select,insert on whool_private.ingest_review_events to service_role;
grant usage on sequence public.product_ingest_id_seq, whool_private.ingest_review_events_id_seq to service_role;

create function whool_private.product_payload(p jsonb) returns jsonb
language sql immutable security invoker set search_path = '' as $$
  select p - array['id','created_at','is_visible'];
$$;
create function whool_private.ingest_errors(p jsonb, raw jsonb, source text) returns text[]
language plpgsql immutable security invoker set search_path = '' as $$
declare errors text[] := '{}'; host text; amount numeric;
begin
  host := case lower(regexp_replace(source,'[^a-zA-Z0-9]','','g'))
    when 'stadium' then 'www.stadium.se' when 'ahlens' then 'www.ahlens.se'
    when 'arket' then 'www.arket.com' when 'minirodini' then 'www.minirodini.com'
    when 'pop' then 'www.polarnopyret.se' when 'polarnopyret' then 'www.polarnopyret.se'
    when 'polarnopyretab' then 'www.polarnopyret.se'
    when 'newbie' then 'www.kappahl.com' when 'lindex' then 'www.lindex.com'
    when 'tretorn' then 'se.tretorn.com' when 'asket' then 'www.asket.com' when 'cdlp' then 'cdlp.com' end;
  if host is null then errors := array_append(errors,'unknown_retailer'); end if;
  if nullif(btrim(p->>'name'),'') is null then errors := array_append(errors,'missing_name'); end if;
  if nullif(btrim(p->>'brand'),'') is null then errors := array_append(errors,'missing_brand'); end if;
  if p->>'retailer' is distinct from source then errors := array_append(errors,'retailer_mismatch'); end if;
  if coalesce(p->>'product_url','') !~ '^https://' or
     split_part(split_part(p->>'product_url','/',3),'?',1) not in (host, regexp_replace(host,'^www\.','')) then
    errors := array_append(errors,'invalid_product_url');
  end if;
  if raw->>'currency' is distinct from 'SEK' then errors := array_append(errors,'unverified_currency'); end if;
  begin amount := (p->>'price_sek')::numeric;
    if amount is null or amount <= 0 or amount > 100000 or amount::text in ('NaN','Infinity','-Infinity') then errors := array_append(errors,'invalid_price'); end if;
  exception when others then errors := array_append(errors,'invalid_price'); end;
  if coalesce(p->>'target_age_group','') not in ('kids','baby','teen') then errors := array_append(errors,'unverified_child_audience'); end if;
  if coalesce(p->>'category','') in ('','other') then errors := array_append(errors,'unclassified_category'); end if;
  if jsonb_typeof(p->'in_stock') is distinct from 'boolean' then errors := array_append(errors,'unverified_stock'); end if;
  if coalesce(p->>'image_url','') !~ '^https://' then errors := array_append(errors,'missing_https_image'); end if;
  if nullif(btrim(p->>'material'),'') is null then errors := array_append(errors,'missing_material'); end if;
  if p->>'eco' = 'true' and nullif(btrim(raw->>'eco_evidence'),'') is null then errors := array_append(errors,'unsupported_eco_claim'); end if;
  return errors;
end;
$$;

create function whool_private.prepare_ingest() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare r public.scrape_runs; base jsonb;
begin
  if new.fetched_at > clock_timestamp()+interval '5 minutes' then raise exception 'Observation timestamp is in the future'; end if;
  new.proposed_product := whool_private.product_payload(new.proposed_product);
  if tg_op = 'UPDATE' then
    if new.proposed_product is distinct from old.proposed_product or new.raw_data is distinct from old.raw_data
      or new.retailer is distinct from old.retailer or new.source_key is distinct from old.source_key
      or new.run_id is distinct from old.run_id or new.fetched_at is distinct from old.fetched_at
      or new.source_url is distinct from old.source_url or new.base_product_hash is distinct from old.base_product_hash then
      raise exception 'Ingest evidence is immutable; submit a new observation';
    end if;
    if new.content_hash is distinct from old.content_hash then raise exception 'Ingest hash changed'; end if;
    return new;
  end if;
  if new.run_id is not null then
    select * into strict r from public.scrape_runs where id=new.run_id for update;
    if r.retailer <> new.retailer then raise exception 'Run retailer mismatch'; end if;
    if (select count(*) from public.product_ingest where run_id=r.id) >= r.max_products then raise exception 'Pilot batch limit reached'; end if;
  end if;
  new.validation_errors := whool_private.ingest_errors(new.proposed_product,new.raw_data,new.retailer);
  new.review_status := case when cardinality(new.validation_errors)=0 then 'pending' else 'needs_review' end;
  new.reviewed_by := null; new.reviewed_at := null; new.review_note := null; new.approved_hash := null; new.published_product_id := null;
  select whool_private.product_payload(to_jsonb(p)) into base from public.products p where product_url=new.proposed_product->>'product_url';
  new.base_product_hash := case when base is null then null else md5(base::text) end;
  new.content_hash := md5(jsonb_build_object('product',new.proposed_product,'evidence',new.raw_data,'base',new.base_product_hash)::text);
  new.last_seen_at := new.fetched_at;
  return new;
end;
$$;
create trigger ingest_prepare before insert or update on public.product_ingest
for each row execute function whool_private.prepare_ingest();

-- Old importers cannot bypass quarantine by writing directly to products.
create function whool_private.quarantine_product_write() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare payload jsonb := whool_private.product_payload(to_jsonb(new)); approved public.product_ingest;
begin
  if nullif(current_setting('whool.publishing_ingest_id',true),'') is not null then
    select * into approved from public.product_ingest where id=current_setting('whool.publishing_ingest_id',true)::bigint;
    if approved.review_status='approved' and approved.approved_hash=approved.content_hash
      and approved.proposed_product <@ payload then return new; end if;
    raise exception 'Publication does not match approved evidence';
  end if;
  if tg_op='UPDATE' then
    if (to_jsonb(new) - array['category','subcategory','print_tags','pattern_tags','motif_tags','decoration_tags','classification','pattern','style','occasion','fit','style_family','is_visible'])
       = (to_jsonb(old) - array['category','subcategory','print_tags','pattern_tags','motif_tags','decoration_tags','classification','pattern','style','occasion','fit','style_family','is_visible']) then return new; end if;
  end if;
  insert into public.product_ingest(retailer,source_key,source_url,fetched_at,raw_data,proposed_product,content_hash)
  values(new.retailer,coalesce(nullif(new.product_url,''),'legacy-id:'||new.id::text),new.product_url,clock_timestamp(),
    payload || jsonb_build_object('ingestion_path','legacy_products_write','currency',null),payload,'computed')
  on conflict (retailer,source_key,content_hash) do update set last_seen_at=greatest(product_ingest.last_seen_at,excluded.last_seen_at),observation_count=product_ingest.observation_count+1;
  return null;
end;
$$;
create trigger products_00_quarantine before insert or update on public.products
for each row execute function whool_private.quarantine_product_write();

create function public.stage_scrape(p_run jsonb, p_items jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare run_id uuid; item jsonb; staged integer:=0; affected integer;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 2000 then raise exception 'Invalid batch size'; end if;
  if jsonb_array_length(p_items) > coalesce((p_run->>'max_products')::integer,50) then raise exception 'Pilot batch limit exceeded'; end if;
  insert into public.scrape_runs(retailer,collected_at,complete,scope,expected_count,max_products,parser_version)
  values(p_run->>'retailer',(p_run->>'collected_at')::timestamptz,coalesce((p_run->>'complete')::boolean,false),
    p_run->>'scope',(p_run->>'expected_count')::integer,coalesce((p_run->>'max_products')::integer,50),p_run->>'parser_version') returning id into run_id;
  for item in select value from jsonb_array_elements(p_items) loop
    insert into public.product_ingest(run_id,retailer,source_key,source_url,fetched_at,raw_data,proposed_product,content_hash)
    values(run_id,p_run->>'retailer',item->>'source_key',item->>'source_url',(p_run->>'collected_at')::timestamptz,item->'raw_data',item->'proposed_product','computed')
    on conflict (retailer,source_key,content_hash) do nothing;
    get diagnostics affected = row_count; staged:=staged+affected;
    if affected=0 then
      update public.product_ingest i set last_seen_at=greatest(i.last_seen_at,(p_run->>'collected_at')::timestamptz),observation_count=i.observation_count+1
      where i.retailer=p_run->>'retailer' and i.source_key=item->>'source_key'
        and i.raw_data=item->'raw_data' and i.proposed_product=whool_private.product_payload(item->'proposed_product');
    end if;
  end loop;
  return jsonb_build_object('run_id',run_id,'staged',staged,'duplicates',jsonb_array_length(p_items)-staged,'published',0);
end;
$$;

create function public.review_scraped_product(p_id bigint,p_action text,p_reviewer text,p_note text,p_expected_hash text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare item public.product_ingest; errors text[]; product_id bigint; current_hash text; prior_setting text;
begin
  if p_action not in ('approve','reject','publish') or length(btrim(coalesce(p_reviewer,'')))<2 or length(btrim(coalesce(p_note,'')))<5 then raise exception 'Explicit reviewer, action and review note required'; end if;
  select * into strict item from public.product_ingest where id=p_id for update;
  if item.content_hash is distinct from p_expected_hash then raise exception 'Evidence changed; reload before reviewing'; end if;
  if item.review_status in ('published','rejected') then raise exception 'Review is already final'; end if;
  errors:=whool_private.ingest_errors(item.proposed_product,item.raw_data,item.retailer);
  if p_action in ('approve','publish') and cardinality(errors)>0 then raise exception 'Correct source evidence before approval: %',errors; end if;
  if p_action='approve' then
    update public.product_ingest set review_status='approved',approved_hash=content_hash,reviewed_by=p_reviewer,reviewed_at=now(),review_note=p_note where id=p_id;
  elsif p_action='reject' then
    update public.product_ingest set review_status='rejected',reviewed_by=p_reviewer,reviewed_at=now(),review_note=p_note where id=p_id;
  else
    if item.review_status<>'approved' or item.approved_hash is distinct from item.content_hash then raise exception 'Approve exact evidence before publication'; end if;
    if item.last_seen_at < now()-interval '24 hours' then raise exception 'Price/stock evidence expired; scrape again'; end if;
    -- Serialize competing publications of the same URL, including a previously absent row.
    perform pg_advisory_xact_lock(hashtextextended(item.proposed_product->>'product_url',0));
    select md5(whool_private.product_payload(to_jsonb(p))::text) into current_hash from public.products p where product_url=item.proposed_product->>'product_url' for update;
    if current_hash is distinct from item.base_product_hash then raise exception 'Catalogue changed since scraping; re-review a fresh observation'; end if;
    prior_setting:=current_setting('whool.publishing_ingest_id',true);
    perform set_config('whool.publishing_ingest_id',p_id::text,true);
    insert into public.products(name,category,subcategory,brand,retailer,product_url,image_url,product_group_id,price_sek,in_stock,target_age_group,target_gender,color,material,source_description,source_pattern,size,eco,print_tags,pattern_tags,motif_tags,decoration_tags,classification)
    select p.name,p.category,p.subcategory,p.brand,p.retailer,p.product_url,p.image_url,p.product_group_id,p.price_sek,p.in_stock,p.target_age_group,p.target_gender,p.color,p.material,p.source_description,p.source_pattern,p.size,coalesce(p.eco,false),coalesce(p.print_tags,'{}'),coalesce(p.pattern_tags,'{}'),coalesce(p.motif_tags,'{}'),coalesce(p.decoration_tags,'{}'),coalesce(p.classification,'{"review_state":"unclassified"}')
    from jsonb_populate_record(null::public.products,item.proposed_product) p
    on conflict (product_url) do update set name=excluded.name,category=excluded.category,subcategory=excluded.subcategory,brand=excluded.brand,retailer=excluded.retailer,image_url=excluded.image_url,product_group_id=excluded.product_group_id,price_sek=excluded.price_sek,in_stock=excluded.in_stock,target_age_group=excluded.target_age_group,target_gender=excluded.target_gender,color=excluded.color,material=excluded.material,source_description=excluded.source_description,source_pattern=excluded.source_pattern,size=excluded.size,eco=excluded.eco,print_tags=excluded.print_tags,pattern_tags=excluded.pattern_tags,motif_tags=excluded.motif_tags,decoration_tags=excluded.decoration_tags,classification=excluded.classification
    returning id into product_id;
    perform set_config('whool.publishing_ingest_id',coalesce(prior_setting,''),true);
    update public.product_ingest set review_status='published',published_product_id=product_id where id=p_id;
  end if;
  insert into whool_private.ingest_review_events(ingest_id,action,reviewer,note,content_hash) values(p_id,p_action,p_reviewer,p_note,item.content_hash);
  return jsonb_build_object('id',p_id,'action',p_action,'product_id',product_id);
end;
$$;
revoke all on all functions in schema whool_private from public,anon,authenticated;
grant execute on all functions in schema whool_private to service_role;
revoke all on function public.stage_scrape(jsonb,jsonb), public.review_scraped_product(bigint,text,text,text,text) from public,anon,authenticated;
grant execute on function public.stage_scrape(jsonb,jsonb), public.review_scraped_product(bigint,text,text,text,text) to service_role;
comment on table public.product_ingest is 'Whool scrape review queue. No public access. Validation is not human approval. Raw evidence is immutable; approved products require separate explicit publication.';
