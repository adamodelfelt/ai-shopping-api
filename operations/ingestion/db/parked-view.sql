create or replace view public.parked_brands with (security_invoker=true) as
 select * from public.brand_pipeline where pipeline_state='parked' order by priority,slug;
create view public.excluded_brands with (security_invoker=true) as
 select * from public.brand_pipeline where pipeline_state='blocked' order by priority,slug;
revoke all on public.excluded_brands from public,anon,authenticated;
grant select on public.excluded_brands to service_role;
