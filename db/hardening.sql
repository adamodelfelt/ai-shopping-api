-- Reviewable hardening for the existing Whool schema. No data deletion.
-- Run in Supabase SQL Editor as owner after rotating privileged credentials.
-- Keep a schema backup first. This file is a proposal, not an applied migration.
begin;
-- Refuse to silently combine this read policy with unknown permissive policies.
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'products'
             and policyname <> 'whool_catalogue_read') then
    raise exception 'Review existing products policies before applying Whool hardening';
  end if;
end;
$$;

alter table public.products enable row level security;
revoke all on table public.products from public, anon, authenticated;
grant select (id, name, price_sek, category, subcategory, color, material, eco,
  brand, retailer, image_url, product_url, product_group_id, target_age_group,
  is_visible, in_stock, print_tags, pattern_tags, motif_tags, decoration_tags)
  on public.products to anon, authenticated;
drop policy if exists whool_catalogue_read on public.products;
create policy whool_catalogue_read on public.products
  for select to anon, authenticated
  using (is_visible is true and in_stock is true and target_age_group in ('kids', 'baby', 'teen'));

alter table public.brand_profiles enable row level security;
alter table public.product_classification_audit enable row level security;
revoke all on table public.brand_profiles, public.product_classification_audit from public, anon, authenticated;
-- Maintenance uses a separate secret key. Never deploy it with the search server.
grant select, insert, update on public.products, public.brand_profiles to service_role;
grant select, insert on public.product_classification_audit to service_role;
-- Existing audit / reviewed-classification triggers remain in place.
-- A compromised service_role/secret key still bypasses RLS: revocation is mandatory.
commit;
