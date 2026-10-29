# Driftsättning

Denna leverans är kod för granskning och test. Att pusha en Git-gren byter inte nycklar och ersätter inte automatiskt den körande produkten. Produktionsmiljön måste konfigureras med nya nycklar och härdade databasrättigheter innan trafik flyttas.

## Förbered databasen

1. Säkerhetskopiera schema och relevanta katalogtabeller. Behåll befintliga gransknings- och audittriggers.
2. Läs `db/hardening.sql`. Den förutsätter den befintliga tabellen `products`, dess katalogfält och tabellerna `brand_profiles` och `product_classification_audit`. Den skapar inte ett nytt tomt schema. Upsert förutsätter den befintliga unika begränsningen på `product_url`.
3. Applicera SQL via Supabase SQL Editor efter nyckelrotation och kör `db/verify.sql`. Okända befintliga produktpolicyer gör att förslaget avbryts så att de kan granskas först.
4. Kontrollera med publishable-nyckeln att katalogkolumner går att läsa och att interna klassificeringsfält inte gör det. Testa i en avskild miljö att INSERT, UPDATE, DELETE och TRUNCATE nekas för publika roller.

Den föreslagna policyn gör endast synliga, lagerförda baby-, barn- och tonårsplagg läsbara. Katalogen blir offentlig produktdata. Inga person- eller kundtabeller ges rättigheter. Andra roller, vyer och RPC-funktioner kräver egen granskning om de läggs till senare.

## Vercel, en gemensam webb- och API-deployment

En isolerad Vercel Preview kan använda `CATALOGUE_SOURCE=snapshot` utan databas- eller AI-hemligheter. Undantaget kräver Vercels systemvariabler `VERCEL=1` och `VERCEL_ENV=preview`; det kan inte användas på en produktionsdeployment. Förhandsversionen använder en begränsad minneskvot och den daterade katalogkopian. Behåll Vercel Authentication på förhandsversionen. Produktionskraven nedan gäller fortsatt.

Använd repositoryts rot som projektrot, Node 24, `npm run build` och `dist` som output. `vercel.json` deklarerar API-funktionerna och säkerhetsheaders. Bekräfta denna konfiguration i en förhandsdeployment innan produktionsbyte.

| Variabel | Innehåll |
| --- | --- |
| `NODE_ENV` | `production` |
| `CATALOGUE_SOURCE` | `supabase` |
| `PUBLIC_ORIGIN` | Exakt egen HTTPS-origin, utan avslutande snedstreck |
| `SUPABASE_URL` | Supabase-projektets HTTPS-URL |
| `SUPABASE_PUBLISHABLE_KEY` | Ny `sb_publishable_…`-nyckel |
| `RATE_LIMIT_URL` | HTTPS-REST-endpoint för en egen Upstash Redis-databas |
| `RATE_LIMIT_TOKEN` | Ny token till samma Redis-databas |

Lägg aldrig importnyckel, OpenAI-nyckel eller gamla `SUPABASE_KEY` på webbdeploymenten. Miljöändringar ska följas av ny deployment. Skapa separata konfigurationer för Preview och Production. Återanvänd aldrig arkivets `.vercel`-mapp eller token.

Upstash-kvoten räknar atomiskt högst 30 API-anrop per minut och klient. Den använder en SHA-256-hash av nätadressen och en TTL på 60 sekunder. På Vercel läses plattformens `x-vercel-forwarded-for`; på egen Node-server används socket-adressen och inga godtyckliga proxyheaders betros. Bakom egen proxy delar klienterna därför kvot om en betrodd IP-adapter inte införs. Råa IP-adresser och söktext skickas inte till Redis av denna implementation. En IP-hash ska ändå hanteras som potentiellt personrelaterad driftdata.

Om tjänsten ska ha inloggning eller privat katalog krävs ett separat autentiserings- och behörighetslager. Publika publishable-nycklar och CORS ersätter inte det. Den nuvarande produkten är en publik katalogsökning.

## Underhåll och GitHub Actions

Skapa GitHub Environment `catalogue-maintenance` och lägg endast där:

- `SUPABASE_URL`
- `SUPABASE_IMPORT_SECRET_KEY`: ny `sb_secret_…`-nyckel, skild från andra system.

Begränsa Environment till den godkända standardgrenen och använd granskning om kontots GitHub-plan stöder detta. Verifiera aktuella butikssidor och en komplett insamling innan första import. Sätt därefter repositoryvariabeln `WHOOL_ROTATION_VERIFIED=true`. Schemat kör 04:17 UTC (05:17 svensk vintertid, 06:17 sommartid). Import kan ge driftdataändringar; endast granskad kod ska få använda underhållshemligheten.

## Acceptans före trafikbyte

- Testsuite, källkodskontroll och bygge passerar i CI.
- Sökning, fästa plagg, nya förslag, gruppredigering, utökning, liknande plagg och Mina val fungerar i Preview.
- Nya nycklar fungerar; de gamla nekas efter återkallelse.
- Public read är begränsad och alla publika skrivningar nekas.
- Produktionskvoten returnerar 429 efter sin gräns och 503 om kvottjänsten fallerar.
- Försök att läsa `.env.local`, interna filer eller gamla `/api/archive/*` ger 404.
- Verifiera att den gamla deploymenten och dess gamla endpoint inte längre får trafik. Avaktivera den separat när bytet är bekräftat.

Rulla vid behov tillbaka koden till den här granskade versionens föregående deployment med **nya** nycklar. Rulla aldrig tillbaka till arkivets röjda hemligheter. Kodåterställning återställer inte databasrättigheter eller nycklar.
