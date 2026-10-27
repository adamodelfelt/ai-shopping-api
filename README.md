# Whool 2

Ny implementation av Whools katalogprodukt: sökning på svenska/engelska, flera sökgrupper, 4/8 synliga plagg, fästa val, nya förslag, redigering av grupper, närliggande färger, liknande plagg och en gemensam lista med butikslänkar.

Webb och API ligger i ett repository och körs på samma origin. Inga externa npm-paket, ingen nyckel i webbläsaren och ingen AI-tjänst behövs. Alla JavaScript-filer är nyskrivna; endast produktdata, återförsäljarnas testdata och granskade märkesordlistor har bevarats som data.

## Kör lokalt

Använd Node 24 (testat med 24.22.1, se `.nvmrc`). Ingen installation av npm-paket krävs.

```sh
npm run dev
```

Öppna `http://127.0.0.1:3000`. Standardläget använder en rensad katalogkopia med 3 592 produkter från den 26 oktober 2026. Den innehåller äldre pris- och lageruppgifter, och detta visas i gränssnittet. Kopians produkt-ID:n är lokala och ska inte skickas till den levande databasen.

```sh
npm test
npm run check
npm run build
```

`dist/` innehåller endast webbens statiska filer. API-rutterna behöver Node-servern eller Vercel Functions.

## Anslut aktuell katalog

Följ [driftsättningen](docs/DEPLOYMENT.md) och [nyckelbytet](docs/KEY_ROTATION.md). `db/hardening.sql` är ett granskningsbart SQL-förslag för det befintliga schemat; det är inte en redan tillämpad migration. En ny Supabase-publishable-nyckel används för läsning under RLS. Importnyckeln används endast av underhållsskript och av skyddad CI.

Produktion vägrar använda katalogkopian och kräver en delad Redis-kvot för API-anrop. Enbart CORS är inte autentisering eller skydd mot automatiserade klienter.

## Katalogunderhåll

```sh
npm run scrape:kids -- --store arket
npm run scrape:kids -- --store all
npm run catalogue:import -- data/runs/<run>/<store>.json
npm run catalogue:import -- data/runs/<run>/<store>.json --apply
npm run catalogue:classify
npm run catalogue:classify -- --apply
npm run brands:sync
npm run brands:sync -- --import
```

Scraprar för ARKET, Mini Rodini, PO.P, Newbie, Lindex och Tretorn respekterar robots.txt, kontrollerar marknad, valuta, lager och täckning och stoppar vid åtkomstspärrar eller ändrade payloads. Tretorns omfattning är barnytterkläder. Begränsade eller ofullständiga körningar får inte importeras. Saknade produkter tas aldrig automatiskt bort eller markeras som slut i lager. Tidigare manuellt granskad klassificering bevaras. Se [funktionsmatrisen](docs/PARITY.md) för verifieringsgränser.

Daglig insamling är förberedd i GitHub Actions men spärrad med `WHOOL_ROTATION_VERIFIED`. Sätt variabeln först efter nyckelbyte, schemahärdning och test av aktuell insamling. Serverns märkesordlista läses från `config/brand-profiles.json`; ändringar där publiceras genom ny driftsättning.

Detaljer om den genomförda incidentgranskningen levereras separat till ägaren. Inga gamla miljöfiler, Git-mappar, kompilerade beroenden eller hemligheter ska föras in i denna kodbas.

## Mitt konto och leveransprofil

Öppna **Mitt konto → Testa med fiktiva uppgifter** för att granska det nya profilflödet. **Prova autofyllning i demokassan** fyller ett lokalt testformulär, inklusive separat C/O och leveranspostnummer. Riktig kontolagring är avstängd tills en säker kontomiljö och e-postkod konfigurerats. Extern butiksifyllning behöver en separat runner/integration. Se [kontodokumentationen](docs/ACCOUNTS.md).
