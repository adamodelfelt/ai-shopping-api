-- Runtime has no catalogue mutation or publication privileges.
revoke insert,update,delete,truncate on public.products from service_role;
revoke execute on function public.review_scraped_product(bigint,text,text,text,text) from service_role;

create extension if not exists pg_net;
create extension if not exists pg_cron;

create table whool_private.ingest_sources (
  id uuid primary key default gen_random_uuid(),
  retailer text not null check (retailer in ('stadium','ahlens')),
  brand text not null check (lower(regexp_replace(brand,'[^a-zA-Z0-9]','','g')) <> 'hm'),
  product_url text not null unique,
  approved_by text not null,
  approval_scope text not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  check ((retailer='stadium' and product_url like 'https://www.stadium.se/product/%') or
         (retailer='ahlens' and product_url like 'https://www.ahlens.se/produkter/barn/%'))
);
create table whool_private.ingest_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references whool_private.ingest_sources(id),
  token_hash text not null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '10 minutes',
  started_at timestamptz,
  finished_at timestamptz,
  request_id bigint,
  run_id uuid references public.scrape_runs(id),
  result jsonb,
  failure_reason text
);
create index ingest_jobs_source_time on whool_private.ingest_jobs(source_id,created_at desc);
create index ingest_jobs_run on whool_private.ingest_jobs(run_id) where run_id is not null;
alter table whool_private.ingest_sources enable row level security;
alter table whool_private.ingest_jobs enable row level security;
revoke all on whool_private.ingest_sources,whool_private.ingest_jobs from public,anon,authenticated,service_role;
grant select on whool_private.ingest_sources to service_role;
grant select,update on whool_private.ingest_jobs to service_role;

-- Only the two already authorized test products are enabled. No category traversal.
insert into whool_private.ingest_sources(retailer,brand,product_url,approved_by,approval_scope,enabled)
values
('stadium','Adidas','https://www.stadium.se/product/800991505/adidas.adidas-entrada26-graphic-troja-barn.black-white','Adam via deployment instruction 2026-10-28','Existing test product only; no brand expansion',false),
('ahlens','Geggamoja','https://www.ahlens.se/produkter/barn/stickad-troja-e7062895-e117-4f80-a635-f14513402bf9','Adam via deployment instruction 2026-10-28','Existing test product only; no brand expansion',false);

create function whool_private.enforce_ingest_allowlist() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if current_user='service_role' and not exists (
    select 1 from whool_private.ingest_sources s where s.enabled and s.retailer=new.retailer
      and s.product_url=new.source_url and s.product_url=new.proposed_product->>'product_url'
      and lower(btrim(s.brand))=lower(btrim(new.proposed_product->>'brand'))
  ) then raise exception 'Source requires explicit operator approval'; end if;
  if lower(regexp_replace(coalesce(new.proposed_product->>'brand',''),'[^a-zA-Z0-9]','','g'))='hm'
    or split_part(coalesce(new.source_url,''),'/',3) ~ '(^|\.)hm\.com$' then raise exception 'H&M excluded'; end if;
  return new;
end;
$$;
create trigger ingest_00_allowlist before insert on public.product_ingest
for each row execute function whool_private.enforce_ingest_allowlist();

create function public.claim_ingest_job(p_job_id uuid,p_token text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare job whool_private.ingest_jobs; source whool_private.ingest_sources;
begin
  if p_token !~ '^[a-f0-9]{64}$' then return null; end if;
  select * into job from whool_private.ingest_jobs where id=p_job_id and status='queued'
    and expires_at>now() and token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
  if not found then return null; end if;
  select * into source from whool_private.ingest_sources where id=job.source_id and enabled;
  if not found then return null; end if;
  update whool_private.ingest_jobs set status='running',started_at=now() where id=job.id;
  return jsonb_build_object('retailer',source.retailer,'brand',source.brand,'product_url',source.product_url);
end;
$$;
create function public.complete_ingest_job(p_job_id uuid,p_token text,p_observed_at timestamptz,p_item jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare job whool_private.ingest_jobs; source whool_private.ingest_sources; staged_result jsonb;
begin
  select * into strict job from whool_private.ingest_jobs where id=p_job_id and status='running'
    and expires_at>now() and token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
  select * into strict source from whool_private.ingest_sources where id=job.source_id and enabled;
  if p_item->>'source_url' is distinct from source.product_url or p_item->'proposed_product'->>'product_url' is distinct from source.product_url
    or p_item->'proposed_product'->>'retailer' is distinct from source.retailer
    or lower(p_item->'proposed_product'->>'brand') is distinct from lower(source.brand) then raise exception 'Source mismatch'; end if;
  if p_observed_at<job.started_at-interval '5 seconds' or p_observed_at>now()+interval '5 minutes' then raise exception 'Invalid observation time'; end if;
  staged_result:=public.stage_scrape(jsonb_build_object('retailer',source.retailer,'collected_at',p_observed_at,'complete',false,
    'scope','Operator-approved single product; no assortment expansion','max_products',1,'parser_version','marketplace-runtime-2026-10-28.1'),jsonb_build_array(p_item));
  update whool_private.ingest_jobs set status='succeeded',finished_at=now(),run_id=(staged_result->>'run_id')::uuid,result=staged_result where id=job.id;
  return staged_result;
end;
$$;
create function public.fail_ingest_job(p_job_id uuid,p_token text,p_reason text) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
  if p_reason not in ('source_not_allowed','brand_mismatch','staging_failed','collection_stopped','runtime_compatibility','robots_disallowed','product_payload_changed','database_stage_error','retailer_network_error','retailer_http_403','retailer_http_429','retailer_http_404','retailer_http_500','retailer_http_502','retailer_http_503','retailer_http_504') then raise exception 'Unknown safe failure category'; end if;
  update whool_private.ingest_jobs set status='failed',finished_at=now(),failure_reason=p_reason
    where id=p_job_id and status='running' and token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
  return found;
end;
$$;

create function whool_private.dispatch_ingest_jobs() returns integer
language plpgsql security invoker set search_path='' as $$
declare source whool_private.ingest_sources; job_id uuid; token text; sent_request_id bigint; dispatched integer:=0;
begin
  perform pg_advisory_xact_lock(hashtextextended('whool-ingestion-dispatch',0));
  update whool_private.ingest_jobs set status='failed',finished_at=now(),failure_reason='job_expired'
    where status in ('queued','running') and expires_at<now();
  for source in select s.* from whool_private.ingest_sources s where s.enabled
    and not exists(select 1 from whool_private.ingest_jobs j where j.source_id=s.id and j.created_at>=date_trunc('day',now()) and j.created_at>=s.updated_at)
    and not exists(select 1 from whool_private.ingest_jobs j where j.source_id=s.id and j.status='failed' and j.created_at>=s.updated_at)
    order by s.retailer limit 3 loop
    token:=encode(extensions.gen_random_bytes(32),'hex');
    insert into whool_private.ingest_jobs(source_id,token_hash) values(source.id,encode(extensions.digest(token,'sha256'),'hex')) returning id into job_id;
    select net.http_post(url:='https://ufcpoxmuygoyseocmrtl.supabase.co/functions/v1/whool-ingest-review',
      headers:=jsonb_build_object('Content-Type','application/json'),body:=jsonb_build_object('job_id',job_id,'token',token),timeout_milliseconds:=60000) into sent_request_id;
    update whool_private.ingest_jobs set request_id=sent_request_id where id=job_id;
    dispatched:=dispatched+1;
  end loop;
  return dispatched;
end;
$$;
-- No public or client role can register sources, dispatch jobs, or obtain job tokens.
revoke all on function whool_private.enforce_ingest_allowlist(),whool_private.dispatch_ingest_jobs() from public,anon,authenticated,service_role;
grant execute on function whool_private.enforce_ingest_allowlist() to service_role;
revoke all on function public.claim_ingest_job(uuid,text),public.complete_ingest_job(uuid,text,timestamptz,jsonb),public.fail_ingest_job(uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_ingest_job(uuid,text),public.complete_ingest_job(uuid,text,timestamptz,jsonb),public.fail_ingest_job(uuid,text,text) to service_role;
comment on table whool_private.ingest_sources is 'Operator-controlled exact product URLs and brands. Adam decides all additions. H&M excluded. No runtime source writes.';
