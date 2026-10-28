# Whool: drift till separat granskningskö

Adam anger urvalsprinciperna. Från 2026-10-28 är sortering och integration av sportmärken med barnsortiment delegerad inom granskningskön. Det kräver ingen ytterligare bekräftelse. Stora modekedjor är parkerade och H&M är uttryckligen blockerat. Detta ger ingen rätt att publicera till huvudkatalogen.

## Avgränsning

Supabase Edge Function `whool-ingest-review` kan bara hantera ett kortlivat jobb för en exakt adress i `whool_private.ingest_sources`. Nike, Adidas, Puma, New Balance och ASICS har varsin registrerad provprodukt hos Intersport. De två tidigare provprodukterna hos Stadium/Åhléns behålls. Det finns ingen obegränsad kategorigenomsökning. Dispatcher behandlar högst 12 källor per körning och prioriterar källor som aldrig eller senast för länge sedan körts.

`brand_integration_queue` visar aktiva integrationsbeslut; `parked_brands` visar sparade men parkerade kedjor. `excluded_brands` visar den uttryckliga H&M-spärren. Basen är `brand_pipeline`, som driftkontot inte kan ändra. Zara och Mango är parkerade enligt uttrycklig instruktion. Next, Cubus och Name It har också lagts åt sidan medan sportmärken prioriteras. Reima, Didriksons och Molo finns kvar som specialistkandidater utanför den aktiva kön.

## Produktkontext

`wear_context` skiljer `casual`, `sport`, `mixed` och `unknown`. `sport_activities` anger exempelvis fotboll, löpning eller inomhusträning. `usage_category` skiljer bland annat vardagsskor, fotbollsskor och löparskor. `usage_classification` sparar regel, källa och textbevis. Uppgifterna ligger i produktkön och motsvarande kolumner är förberedda i `products`. Befintliga katalogprodukter har inte omklassificerats.

Adidas Gazelle och Gazelle Indoor klassas som vardagsskor enligt Adams modellregel. Historisk sportbakgrund eller ordet Indoor gör dem inte till aktuella träningsskor. Fotbollsskor klassas som fotboll även om designtexten nämner streetwear. Produkter som uttryckligen passar både löpning och vardag kan vara `mixed`. Ett sportmärke, en logotyp eller uttrycket sportig stil räcker inte för att anta sportanvändning. Svaga belägg blir `unknown` för vidare granskning.

Intersports data kopplas till exakt produkt-SKU, så att rekommenderade produkter inte blandas in. Lager hämtas per variant från kanalen ONLINE. Ursprunglig storleksbeteckning och filterstorlek sparas separat utan att storlekssystem gissas. Grundpris och villkorat kampanjpris hålls isär; okänd kampanjbehörighet sänker inte det föreslagna grundpriset.

Körningen sparar endast i `product_ingest`/`scrape_runs` och jobbloggen. Driftrollen saknar INSERT, UPDATE, DELETE och TRUNCATE på `public.products`. Den saknar även EXECUTE på publiceringsfunktionen. Godkännande och publicering görs tills vidare endast av administratör efter uttrycklig instruktion; de ingår inte i driften.

## Autentisering

Edge-endpointen har egen jobbautentisering i stället för gateway-JWT. Scheduler skapar 32 slumpbyte, sparar en SHA-256-hash och skickar token i en POST-kropp till den egna funktionen. Token gäller tio minuter, är bunden till ett jobb och kan bara användas för en claim. Kroppen innehåller inga person- eller betaluppgifter. Endpointen accepterar inte valfri URL, varumärke eller produktdata från anroparen.

Worker använder Supabases inbyggda servernyckel internt för tre avgränsade RPC-operationer. Nyckeln läses aldrig ut i loggar eller svar. Källregistret är skrivskyddat för driftrollen. Alla funktioner är SECURITY INVOKER och RLS är aktiverat på nya tabeller; inget är tillgängligt för anon/authenticated.

## Körning och stopp

Uppdatering: dagligen 04:17 UTC (05:17 svensk vintertid, 06:17 sommartid), endast för de uttryckligen registrerade provprodukterna. Detta är inte ett schema för att lägga till nya varumärken. En misslyckad körning pausar den aktuella källan tills en operatör granskat orsaken och ändrat `updated_at` i källregistret. Worker gör ett försök, följer robots.txt och kringgår inte åtkomstkontroller.

Verifierad första driftkörning 2026-10-28: Åhléns sparade observationen i kön och deduplicerade oförändrad produkt (0 publicerade). Stadium svarade med HTTP 429 och är pausat för granskning. Ingen alternativ nätverksväg eller automatisk återförsökning har aktiverats. Katalogen är fortsatt 4 306 produkter.

Efter den delegerade sportutökningen lyckades samtliga fem separata Intersport-piloter: Nike, Adidas, Puma, New Balance och ASICS. Varje pilot avser en exakt barnprodukt, inte märkets hela sortiment. Materialuppgifter som saknas är fortsatt flaggade `missing_material`; ingen post har godkänts eller publicerats automatiskt. Gazelle är `casual`, Nike/Puma-skorna är `sport/football`, ASICS är `sport/indoor_training`, och New Balance är `mixed/running` utifrån dess beskrivning av både vardag och löpning.

Nya databasfiler efter grundinstallationen: `db/sports-queue.sql`, `db/sports-runtime-update.sql`, `db/sports-sources.sql` och `db/parked-view.sql`, i den ordningen. Källor aktiveras endast inom den delegerade urvalspolicyn efter att motsvarande parser är driftsatt. Befintliga råa observationer är oförändrade; sorteringsmetadata på ännu ogranskade poster kan förfinas från deras sparade källtext.

`whool_private.ingest_jobs` visar status, säker felkategori och resultat. `net._http_response` innehåller scheduler-anropets HTTP-status. Kör aldrig SELECT av request-kroppar eller tokenhashar vid vanlig felsökning.

## Tester

```sh
node --test operations/ingestion/test/*.test.js
```

CI kör samma tester utan drifthemligheter. Testerna kontrollerar otillåtna jobb, fel domän eller varumärke, H&M-spärr, storleks-/prisbevis, batchgränser och att worker inte har någon operation för publicering. SQL-verifieringen körs separat med rollback och kontrollerar jobbets livscykel, tokenåteranvändning och faktiska databasprivilegier.

## Kandidater för Adams senare urval

Föreslagen ordning är från breda internationella aktörer till mindre specialister, inte en verifierad omsättningsranking:

1. Aktiv sportpilot: Nike, Adidas, Puma, New Balance och ASICS.
2. Specialistkandidater: Reima, Didriksons och Molo.
3. Parkerade utanför kön: Zara, Mango, Next, Cubus och Name It. H&M är blockerat.

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

Aktiveringen av sportpiloterna följer den senare delegeringen. Parkerade kedjor samlas inte in. Nya observationer och deras sport-/vardagsklassning förblir i granskningskön; publiceringsrättigheter är fortfarande spärrade.
