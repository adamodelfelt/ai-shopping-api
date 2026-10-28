-- Whool Vint is isolated from public.products and the Com ingestion pipeline.
create schema vint_private;
revoke all on schema vint_private from public,anon,authenticated;
grant usage on schema vint_private to service_role;
create table vint_private.gateway_keys (key_hash text primary key,created_at timestamptz not null default now());
create table vint_private.sources (
 id text primary key check(id in ('vinted','tradera','inimini','glamupkids','barnensbudget')),
 name text not null,host text not null,enabled boolean not null default true,
 paused boolean not null default false,last_checked_at timestamptz,last_attempt_at timestamptz,
 next_refresh_at timestamptz not null default now()+interval '1 hour',
 lease_id uuid,lease_until timestamptz,message text
);
create table vint_private.listings (
 id uuid primary key default gen_random_uuid(),source_id text not null references vint_private.sources(id),
 external_id text not null,source_url text not null unique,brand_slug text references public.brand_pipeline(slug),
 payload jsonb not null,evidence jsonb not null default '{}',
 review_status text not null check(review_status in ('ready','held')),
 availability text not null check(availability in ('available','reserved','sold','removed','unknown')),
 observed_at timestamptz not null,display_rank integer not null default 100,
 created_at timestamptz not null default now(),unique(source_id,external_id),
 check(source_url ~ '^https://'),check(jsonb_typeof(payload)='object')
);
create table vint_private.observations (
 id bigint generated always as identity primary key,listing_id uuid not null references vint_private.listings(id),
 observed_at timestamptz not null default now(),content_hash text not null,payload jsonb not null,evidence jsonb not null,
 unique(listing_id,content_hash)
);
create index vint_listings_source on vint_private.listings(source_id);
create index vint_listings_brand on vint_private.listings(brand_slug);
create index vint_listings_visible on vint_private.listings(observed_at,display_rank) where review_status='ready' and availability='available';
alter table vint_private.gateway_keys enable row level security;
alter table vint_private.sources enable row level security;
alter table vint_private.listings enable row level security;
alter table vint_private.observations enable row level security;
revoke all on all tables in schema vint_private from public,anon,authenticated,service_role;
grant select on vint_private.gateway_keys to service_role;
grant select,update on vint_private.sources,vint_private.listings to service_role;
grant select,insert on vint_private.observations to service_role;
grant usage on sequence vint_private.observations_id_seq to service_role;

create function vint_private.validate_listing() returns trigger language plpgsql security invoker set search_path='' as $$
declare host text;
begin
 select s.host into strict host from vint_private.sources s where s.id=new.source_id;
 if split_part(new.source_url,'/',3) is distinct from host or new.source_url !~ '^https://' then raise exception 'Vint source mismatch';end if;
 if new.payload->>'url' is distinct from new.source_url or new.payload->>'source_id' is distinct from new.source_id then raise exception 'Vint identity mismatch';end if;
 if new.payload->>'brand_slug' is distinct from new.brand_slug then raise exception 'Vint brand mismatch';end if;
 if new.review_status='ready' and (new.brand_slug is null or not exists(select 1 from public.brand_pipeline where slug=new.brand_slug and pipeline_state in ('active','testing'))) then raise exception 'Vint brand outside active queue';end if;
 if new.review_status='ready' and (coalesce(new.payload->>'size','')='' or coalesce(new.payload->>'title','')='' or new.payload->>'category'='unknown' or new.payload->>'currency' is distinct from 'SEK' or coalesce((new.payload->>'price_sek')::numeric,0)<=0 or (new.payload->>'price_sek')::numeric>20000) then raise exception 'Vint core data invalid';end if;
 if new.observed_at>now()+interval '5 minutes' then raise exception 'Vint future evidence';end if;
 return new;
end;$$;
create trigger vint_validate before insert or update on vint_private.listings for each row execute function vint_private.validate_listing();

create function public.vint_authenticate(p_key text) returns boolean language sql stable security invoker set search_path='' as $$
 select length(p_key)=64 and exists(select 1 from vint_private.gateway_keys where key_hash=encode(extensions.digest(p_key,'sha256'),'hex'));
$$;
create function public.vint_catalogue() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('version','whool-vint-2026-10-28.1','generated_at',now(),
 'items',coalesce((select jsonb_agg((l.payload-'evidence'-'review_status'-'external_id')||jsonb_build_object('id',l.id,'display_rank',l.display_rank,'observed_at',l.observed_at) order by l.display_rank)
 from vint_private.listings l join vint_private.sources s on s.id=l.source_id join public.brand_pipeline b on b.slug=l.brand_slug
 where l.review_status='ready' and l.availability='available' and l.observed_at>now()-interval '24 hours' and (nullif(l.payload->>'end_date','') is null or (l.payload->>'end_date')::timestamptz>now()) and s.enabled and b.pipeline_state in ('active','testing')), '[]'::jsonb),
 'sources',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'last_checked_at',s.last_checked_at,'paused',s.paused,'message',s.message) order by case s.id when 'vinted' then 1 when 'tradera' then 2 when 'inimini' then 3 when 'glamupkids' then 4 else 5 end) from vint_private.sources s where enabled),'[]'::jsonb));
$$;
create function public.vint_claim_refresh() returns jsonb language plpgsql security invoker set search_path='' as $$
declare s vint_private.sources; token uuid;
begin
 select * into s from vint_private.sources where enabled and not paused and next_refresh_at<now() and (lease_until is null or lease_until<now()) order by next_refresh_at,id for update skip locked limit 1;
 if not found then return null;end if;
 token:=gen_random_uuid();
 update vint_private.sources set lease_id=token,lease_until=now()+interval '2 minutes',last_attempt_at=now(),next_refresh_at=now()+interval '1 hour' where id=s.id;
 return jsonb_build_object('source_id',s.id,'lease_id',token,'items',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'url',l.source_url,'brand_slug',l.brand_slug) order by display_rank) from vint_private.listings l where l.source_id=s.id),'[]'::jsonb));
end;$$;
create function public.vint_record_observation(p_lease_id uuid,p_listing_id uuid,p_payload jsonb) returns boolean language plpgsql security invoker set search_path='' as $$
declare l vint_private.listings;s vint_private.sources;state text;observed timestamptz;fingerprint text;
begin
 select * into strict l from vint_private.listings where id=p_listing_id for update;
 select * into strict s from vint_private.sources where id=l.source_id and lease_id=p_lease_id and lease_until>now();
 if p_payload->>'url' is distinct from l.source_url or p_payload->>'source_id' is distinct from l.source_id or p_payload->>'brand_slug' is distinct from l.brand_slug then raise exception 'Vint observation identity mismatch';end if;
 observed:=(p_payload->>'observed_at')::timestamptz;
 if observed<now()-interval '5 minutes' or observed>now()+interval '5 minutes' then raise exception 'Vint stale observation';end if;
 state:=p_payload->>'availability';if state not in ('available','reserved','sold','removed','unknown') then raise exception 'Vint availability invalid';end if;
 fingerprint:=encode(extensions.digest(((p_payload-'observed_at'-'evidence')::text)||coalesce((p_payload->'evidence')::text,''),'sha256'),'hex');
 insert into vint_private.observations(listing_id,observed_at,content_hash,payload,evidence) values(l.id,observed,fingerprint,p_payload-'evidence',coalesce(p_payload->'evidence','{}')) on conflict(listing_id,content_hash) do nothing;
 update vint_private.listings set payload=p_payload-'evidence',evidence=coalesce(p_payload->'evidence','{}'),availability=state,review_status=p_payload->>'review_status',observed_at=observed where id=l.id;
 return true;
end;$$;
create function public.vint_complete_refresh(p_lease_id uuid,p_source_id text,p_success integer,p_error text) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_error is not null and p_error not in ('http_403','http_429','source_changed','network_error','partial_failure') then raise exception 'Unknown failure';end if;
 update vint_private.sources set last_checked_at=case when p_success>0 then now() else last_checked_at end,
 paused=paused or coalesce(p_error in ('http_403','http_429'),false),
 message=case when p_error in ('http_403','http_429') then 'Kontrollen är pausad. Senaste bekräftade uppgifter visas i högst 24 timmar.' when p_error is not null then 'Några annonser kunde inte kontrolleras vid senaste försöket.' else null end,
 lease_id=null,lease_until=null where id=p_source_id and lease_id=p_lease_id and lease_until>now();
 return found;
end;$$;
revoke all on function vint_private.validate_listing() from public,anon,authenticated;
grant execute on function vint_private.validate_listing() to service_role;
revoke all on function public.vint_authenticate(text),public.vint_catalogue(),public.vint_claim_refresh(),public.vint_record_observation(uuid,uuid,jsonb),public.vint_complete_refresh(uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.vint_authenticate(text),public.vint_catalogue(),public.vint_claim_refresh(),public.vint_record_observation(uuid,uuid,jsonb),public.vint_complete_refresh(uuid,text,integer,text) to service_role;
comment on schema vint_private is 'Whool Vint beta: isolated secondhand observations. No publication path to Whool Com products.';
comment on function public.vint_claim_refresh() is 'Only pre-registered exact listing URLs; one source per request; one-hour cooldown; no source or brand expansion.';
