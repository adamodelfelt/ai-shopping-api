begin;
do $$
begin
 if has_table_privilege('service_role','public.products','INSERT')
    or has_table_privilege('service_role','public.products','UPDATE')
    or has_table_privilege('service_role','public.products','DELETE')
    or has_table_privilege('service_role','public.products','TRUNCATE') then raise exception 'Catalogue mutation is available to runtime'; end if;
 if has_function_privilege('service_role','public.review_scraped_product(bigint,text,text,text,text)','EXECUTE') then raise exception 'Runtime can publish'; end if;
 if has_table_privilege('service_role','whool_private.ingest_sources','INSERT')
    or has_table_privilege('service_role','whool_private.ingest_sources','UPDATE') then raise exception 'Runtime can add sources'; end if;
 if has_table_privilege('anon','public.product_ingest','SELECT')
    or has_table_privilege('authenticated','public.product_ingest','SELECT') then raise exception 'Queue is public'; end if;
 if has_function_privilege('anon','public.claim_ingest_job(uuid,text)','EXECUTE') then raise exception 'Worker RPC is public'; end if;
end $$;
rollback;
