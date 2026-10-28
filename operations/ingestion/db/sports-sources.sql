insert into whool_private.ingest_sources(retailer,brand,product_url,approved_by,approval_scope,enabled) values
('intersport','Adidas','https://www.intersport.se/products/adidas-originals-gazelle-jr-sneakers-barn/cblack-ftwwht-goldmt-159534901','Adam delegated sports integration 2026-10-28','Children Gazelle lifestyle pilot; source-based use classification',false),
('intersport','Nike','https://www.intersport.se/products/nike-mercurial-superfly-11-academy-big-kids-mg-jr-fotbollsskor/white-blur-bright-crimson-162772001','Adam delegated sports integration 2026-10-28','Children football footwear pilot',false),
('intersport','Puma','https://www.intersport.se/products/puma-ultra-6-match-fg-ag-jr-fotbollsskor/icy-blue-puma-white-blue-jewel-161226104','Adam delegated sports integration 2026-10-28','Children football footwear pilot',false),
('intersport','New Balance','https://www.intersport.se/products/new-balance-fresh-foam-578-kids-jr-loparskor-barn/black-161669401','Adam delegated sports integration 2026-10-28','Children running/casual use pilot; keep mixed use evidence',false),
('intersport','ASICS','https://www.intersport.se/products/asics-upcourt-6-gs-jr-inomhusskor-barn/white-black','Adam delegated sports integration 2026-10-28','Children indoor footwear pilot; do not infer a specific team sport',false)
on conflict(product_url) do nothing;
