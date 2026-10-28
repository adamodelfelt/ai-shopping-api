create or replace function whool_private.enforce_ingest_allowlist() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if current_user='service_role' and not exists (
    select 1 from whool_private.ingest_sources s where s.enabled and s.retailer=new.retailer
      and s.product_url=new.source_url and s.product_url=new.proposed_product->>'product_url'
      and whool_private.brand_key(s.brand)=whool_private.brand_key(new.proposed_product->>'brand')
  ) then raise exception 'Source requires explicit operator approval'; end if;
  if lower(regexp_replace(coalesce(new.proposed_product->>'brand',''),'[^a-zA-Z0-9]','','g'))='hm'
    or split_part(coalesce(new.source_url,''),'/',3) ~ '(^|\.)hm\.com$' then raise exception 'H&M excluded'; end if;
  return new;
end;
$$;

create or replace function public.complete_ingest_job(p_job_id uuid,p_token text,p_observed_at timestamptz,p_item jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare job whool_private.ingest_jobs; source whool_private.ingest_sources; staged_result jsonb;
begin
  select * into strict job from whool_private.ingest_jobs where id=p_job_id and status='running'
    and expires_at>now() and token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
  select * into strict source from whool_private.ingest_sources where id=job.source_id and enabled;
  if p_item->>'source_url' is distinct from source.product_url or p_item->'proposed_product'->>'product_url' is distinct from source.product_url
    or p_item->'proposed_product'->>'retailer' is distinct from source.retailer
    or whool_private.brand_key(p_item->'proposed_product'->>'brand') is distinct from whool_private.brand_key(source.brand) then raise exception 'Source mismatch'; end if;
  if p_observed_at<job.started_at-interval '5 seconds' or p_observed_at>now()+interval '5 minutes' then raise exception 'Invalid observation time'; end if;
  staged_result:=public.stage_scrape(jsonb_build_object('retailer',source.retailer,'collected_at',p_observed_at,'complete',false,
    'scope','Operator-approved single product; no assortment expansion','max_products',1,'parser_version','marketplace-runtime-2026-10-28.1'),jsonb_build_array(p_item));
  update whool_private.ingest_jobs set status='succeeded',finished_at=now(),run_id=(staged_result->>'run_id')::uuid,result=staged_result where id=job.id;
  return staged_result;
end;
$$;

create or replace function whool_private.dispatch_ingest_jobs() returns integer
language plpgsql security invoker set search_path='' as $$
declare source whool_private.ingest_sources; job_id uuid; token text; sent_request_id bigint; dispatched integer:=0;
begin
  perform pg_advisory_xact_lock(hashtextextended('whool-ingestion-dispatch',0));
  update whool_private.ingest_jobs set status='failed',finished_at=now(),failure_reason='job_expired'
    where status in ('queued','running') and expires_at<now();
  for source in select s.* from whool_private.ingest_sources s where s.enabled
    and not exists(select 1 from whool_private.ingest_jobs j where j.source_id=s.id and j.created_at>=date_trunc('day',now()) and j.created_at>=s.updated_at)
    and not exists(select 1 from whool_private.ingest_jobs j where j.source_id=s.id and j.status='failed' and j.created_at>=s.updated_at)
    order by (select max(j.created_at) from whool_private.ingest_jobs j where j.source_id=s.id) nulls first,s.retailer,s.id limit 12 loop
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

create or replace function whool_private.ingest_errors(p jsonb, raw jsonb, source text) returns text[]
language plpgsql immutable security invoker set search_path = '' as $$
declare errors text[] := '{}'; host text; amount numeric;
begin
  host := case lower(regexp_replace(source,'[^a-zA-Z0-9]','','g'))
    when 'intersport' then 'www.intersport.se' when 'stadium' then 'www.stadium.se' when 'ahlens' then 'www.ahlens.se'
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

create or replace function public.review_scraped_product(p_id bigint,p_action text,p_reviewer text,p_note text,p_expected_hash text) returns jsonb
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
    insert into public.products(name,category,subcategory,brand,retailer,product_url,image_url,product_group_id,price_sek,in_stock,target_age_group,target_gender,color,material,source_description,source_pattern,size,eco,print_tags,pattern_tags,motif_tags,decoration_tags,classification,wear_context,sport_activities,usage_category,usage_classification)
    select p.name,p.category,p.subcategory,p.brand,p.retailer,p.product_url,p.image_url,p.product_group_id,p.price_sek,p.in_stock,p.target_age_group,p.target_gender,p.color,p.material,p.source_description,p.source_pattern,p.size,coalesce(p.eco,false),coalesce(p.print_tags,'{}'),coalesce(p.pattern_tags,'{}'),coalesce(p.motif_tags,'{}'),coalesce(p.decoration_tags,'{}'),coalesce(p.classification,'{"review_state":"unclassified"}'),coalesce(p.wear_context,'unknown'),coalesce(p.sport_activities,'{}'),coalesce(p.usage_category,'unknown'),coalesce(p.usage_classification,'{"state":"unclassified","evidence":[]}')
    from jsonb_populate_record(null::public.products,item.proposed_product) p
    on conflict (product_url) do update set name=excluded.name,category=excluded.category,subcategory=excluded.subcategory,brand=excluded.brand,retailer=excluded.retailer,image_url=excluded.image_url,product_group_id=excluded.product_group_id,price_sek=excluded.price_sek,in_stock=excluded.in_stock,target_age_group=excluded.target_age_group,target_gender=excluded.target_gender,color=excluded.color,material=excluded.material,source_description=excluded.source_description,source_pattern=excluded.source_pattern,size=excluded.size,eco=excluded.eco,print_tags=excluded.print_tags,pattern_tags=excluded.pattern_tags,motif_tags=excluded.motif_tags,decoration_tags=excluded.decoration_tags,classification=excluded.classification,wear_context=excluded.wear_context,sport_activities=excluded.sport_activities,usage_category=excluded.usage_category,usage_classification=excluded.usage_classification
    returning id into product_id;
    perform set_config('whool.publishing_ingest_id',coalesce(prior_setting,''),true);
    update public.product_ingest set review_status='published',published_product_id=product_id where id=p_id;
  end if;
  insert into whool_private.ingest_review_events(ingest_id,action,reviewer,note,content_hash) values(p_id,p_action,p_reviewer,p_note,item.content_hash);
  return jsonb_build_object('id',p_id,'action',p_action,'product_id',product_id);
end;
$$;
