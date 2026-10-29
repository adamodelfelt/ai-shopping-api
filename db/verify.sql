-- Read-only verification after applying hardening; also suitable inside a rollback-only test.
select tablename, rowsecurity from pg_tables
where schemaname = 'public' order by tablename;
select policyname, roles, cmd, qual from pg_policies
where schemaname = 'public' and tablename = 'products';
select role_name,
  has_column_privilege(role_name, 'public.products', 'name', 'SELECT') as can_read_catalogue_name,
  has_column_privilege(role_name, 'public.products', 'classification', 'SELECT') as can_read_internal_classification,
  has_table_privilege(role_name, 'public.products', 'INSERT') as can_insert,
  has_table_privilege(role_name, 'public.products', 'UPDATE') as can_update,
  has_table_privilege(role_name, 'public.products', 'DELETE') as can_delete,
  has_table_privilege(role_name, 'public.products', 'TRUNCATE') as can_truncate
from (values ('anon'), ('authenticated')) as roles(role_name);
-- Expected: true, false, false, false, false, false for each role.
-- In SQL Editor, use BEGIN; SET LOCAL ROLE anon; SELECT id,name FROM public.products LIMIT 1; ROLLBACK;
-- Confirm no hidden, adult or out-of-stock row is readable and private columns return permission denied.
