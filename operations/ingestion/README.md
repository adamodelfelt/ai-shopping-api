# Whool: drift till separat granskningskö

Ägare av varumärkesurval: Adam. Nya märken och nya produktadresser registreras endast efter hans instruktion. H&M är spärrat i både databas och worker. Förslag i detta dokument är inte tillåtna källor.

## Avgränsning

Supabase Edge Function `whool-ingest-review` kan bara hantera ett kortlivat jobb för en exakt adress i `whool_private.ingest_sources`. De två befintliga provprodukterna (Adidas hos Stadium, Geggamoja hos Åhléns) är de enda registrerade källorna. Det finns ingen kategorigenomsökning eller automatisk upptäckt av nya varumärken.

Körningen sparar endast i `product_ingest`/`scrape_runs` och jobbloggen. Driftrollen saknar INSERT, UPDATE, DELETE och TRUNCATE på `public.products`. Den saknar även EXECUTE på publiceringsfunktionen. Godkännande och publicering görs tills vidare endast av administratör efter uttrycklig instruktion; de ingår inte i driften.

## Autentisering

Edge-endpointen har egen jobbautentisering i stället för gateway-JWT. Scheduler skapar 32 slumpbyte, sparar en SHA-256-hash och skickar token i en POST-kropp till den egna funktionen. Token gäller tio minuter, är bunden till ett jobb och kan bara användas för en claim. Kroppen innehåller inga person- eller betaluppgifter. Endpointen accepterar inte valfri URL, varumärke eller produktdata från anroparen.

Worker använder Supabases inbyggda servernyckel internt för tre avgränsade RPC-operationer. Nyckeln läses aldrig ut i loggar eller svar. Källregistret är skrivskyddat för driftrollen. Alla funktioner är SECURITY INVOKER och RLS är aktiverat på nya tabeller; inget är tillgängligt för anon/authenticated.

## Körning och stopp

Uppdatering: dagligen 04:17 UTC (05:17 svensk vintertid, 06:17 sommartid), endast för de uttryckligen registrerade provprodukterna. Detta är inte ett schema för att lägga till nya varumärken. En misslyckad körning pausar den aktuella källan tills en operatör granskat orsaken och ändrat `updated_at` i källregistret. Worker gör ett försök, följer robots.txt och kringgår inte åtkomstkontroller.

Verifierad första driftkörning 2026-10-28: Åhléns sparade observationen i kön och deduplicerade oförändrad produkt (0 publicerade). Stadium svarade med HTTP 429 och är pausat för granskning. Ingen alternativ nätverksväg eller automatisk återförsökning har aktiverats. Katalogen är fortsatt 4 306 produkter.

`whool_private.ingest_jobs` visar status, säker felkategori och resultat. `net._http_response` innehåller scheduler-anropets HTTP-status. Kör aldrig SELECT av request-kroppar eller tokenhashar vid vanlig felsökning.

## Tester

```sh
node --test operations/ingestion/test/*.test.js
```

CI kör samma tester utan drifthemligheter. Testerna kontrollerar otillåtna jobb, fel domän eller varumärke, H&M-spärr, storleks-/prisbevis, batchgränser och att worker inte har någon operation för publicering. SQL-verifieringen körs separat med rollback och kontrollerar jobbets livscykel, tokenåteranvändning och faktiska databasprivilegier.

## Kandidater för Adams senare urval

Föreslagen ordning är från breda internationella aktörer till mindre specialister, inte en verifierad omsättningsranking:

1. Nike, Zara Kids, Next – internationell bredd och många produkt-/storleksvarianter.
2. Mango Kids, Name It, Cubus – breda vardags- och barnsortiment.
3. Reima, Didriksons, Molo – specialister med funktionella ytterkläder respektive tydliga mönster och färger.

Officiella sortiment kontrollerade 2026-10-28:

- https://www.nike.com/se/w/kids-klader-6ymx6zv4dh/
- https://www.zara.com/se/sv/barn-mkt1.html
- https://www.next.se/sv/shop/childrens
- https://shop.mango.com/se/sv/h/barn
- https://www.nameit.com/sv-se/ni-kids/ni-kids-all/allt/
- https://cubus.com/sv/barn
- https://www.reima.com/sv-SE
- https://www.didriksons.com/se/c/barn
- https://www.molo.com/sv-SE

Ingen av dessa kandidater har lagts till. Adidas och Geggamoja räknas som befintliga testmärken. Övriga redan befintliga katalogmärken är inte nya integrationsbeslut genom denna driftsättning.
