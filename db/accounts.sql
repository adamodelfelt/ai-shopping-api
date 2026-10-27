-- Proposal for a NEW account database, or a database whose exposed elevated keys
-- have already been revoked. Do not apply to an unresolved incident environment.
-- No real customer records are included here.
begin;
create table public.account_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null check (length(first_name) between 1 and 80 and first_name !~ '[[:cntrl:]]'),
  last_name text not null check (length(last_name) between 1 and 80 and last_name !~ '[[:cntrl:]]'),
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  address_line1 text not null check (length(address_line1) between 1 and 160 and address_line1 !~ '[[:cntrl:]]'),
  address_line2 text not null default '' check (length(address_line2) <= 160 and address_line2 !~ '[[:cntrl:]]'),
  care_of text not null default '' check (length(care_of) <= 80 and care_of !~ '[[:cntrl:]]'),
  postal_code text not null check (postal_code ~ '^[0-9]{5}$'),
  city text not null check (length(city) between 1 and 80 and city !~ '[[:cntrl:]]'),
  country_code text not null default 'SE' check (country_code = 'SE'),
  updated_at timestamptz not null default now()
);
alter table public.account_profiles enable row level security;
alter table public.account_profiles force row level security;
revoke all on public.account_profiles from public, anon, authenticated;
grant select, insert, update, delete on public.account_profiles to authenticated;
create policy account_profile_select on public.account_profiles for select to authenticated
  using ((select auth.uid()) = user_id);
create policy account_profile_insert on public.account_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy account_profile_update on public.account_profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy account_profile_delete on public.account_profiles for delete to authenticated
  using ((select auth.uid()) = user_id);
create policy account_profile_direct_sessions on public.account_profiles as restrictive for all to authenticated
  using ((select auth.jwt()->>'client_id') is null and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false)
  with check ((select auth.jwt()->>'client_id') is null and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false);
create function public.touch_account_profile() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
revoke all on function public.touch_account_profile() from public, anon, authenticated;
create trigger account_profile_updated before update on public.account_profiles
  for each row execute function public.touch_account_profile();
-- Favorites are separate from delivery details: no address is needed to save a product.
create table public.account_favorites (
  user_id uuid primary key references auth.users(id) on delete cascade,
  product_ids text[] not null default '{}' check (
    cardinality(product_ids) <= 100 and array_position(product_ids, null) is null
    and array_to_string(product_ids, ',') ~ '^([0-9]{1,18}(,[0-9]{1,18})*)?$'
  )
);
alter table public.account_favorites enable row level security;
alter table public.account_favorites force row level security;
revoke all on public.account_favorites from public, anon, authenticated;
grant select, insert, update, delete on public.account_favorites to authenticated;
create policy account_favorites_select on public.account_favorites for select to authenticated using ((select auth.uid()) = user_id);
create policy account_favorites_insert on public.account_favorites for insert to authenticated with check ((select auth.uid()) = user_id);
create policy account_favorites_update on public.account_favorites for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy account_favorites_delete on public.account_favorites for delete to authenticated using ((select auth.uid()) = user_id);
create policy account_favorites_direct_sessions on public.account_favorites as restrictive for all to authenticated
  using ((select auth.jwt()->>'client_id') is null and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false)
  with check ((select auth.jwt()->>'client_id') is null and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) is false);
commit;
