# Fortsätta Whool från molnet

Uppdaterad 28 oktober 2026 inför arbete från mobilen medan den lokala datorn är avstängd.

## Repository och gren

- Repository: https://github.com/adamodelfelt/ai-shopping-api
- Aktuell utvecklingsgren: `feature/account-demo`.
- Utkast till PR: https://github.com/adamodelfelt/ai-shopping-api/pull/1
- Senaste funktionsändringen före denna dokumentation: `d33427431267dc037732fc36865220be75256d8b` — flera samtidiga produkttaggar.
- Arbetet är pushat till utvecklingsgrenen. Ingen sammanslagning till `main` eller produktionsrelease har gjorts. Välj utvecklingsgrenen när ett nytt molnarbete startas.

Repositoryts rot innehåller hela webbappen, API-funktionerna, katalogkopian, testsuiten, databasförslagen, Safari-tilläggets källkod och byggskripten. Det är en fristående Node 24-app utan externa npm-beroenden. Inga filer från den gamla ZIP-leveransen behövs för att starta.

## Start och kontroll

```sh
git clone --branch feature/account-demo --single-branch https://github.com/adamodelfelt/ai-shopping-api.git
cd ai-shopping-api
node --version
npm run check
npm test
npm run build
npm run dev
```

Använd Node 24 enligt `.nvmrc`. En befintlig arbetsmiljö behöver endast välja rätt gren och hämta dess senaste version; klona inte inuti en befintlig arbetskopia. Inga nycklar eller `.env.local` krävs för lokal utveckling med standardlägets katalogkopia. Öppna `/` för butiken och `/studio.html` för Whool Studio. API-rutterna behöver Node-servern eller Vercel Functions; de fungerar inte genom att enbart öppna HTML-filen. I en miljö som kräver lyssning på alla nätverksgränssnitt kan utvecklingsservern startas med `HOST=0.0.0.0 npm run dev` och miljöns vanliga portförhandsvisning.

89 tester, källsäkerhetskontroll och bygge passerade för funktionsändringen ovan. Båda GitHub CI-körningarna och Vercel Preview passerade också. Testet av flera samtidiga taggar omfattar sparande, avmarkering, bevarade tidigare revisioner och JSON-export.

## Aktuellt produktläge

- Sökning: knallrött prioriteras, vinrött kan ingå, och de utpekade bruna/orange plaggen blandas inte in. Täck-/skalbyxor skiljs från vanlig byxsökning. Prickigt, randigt, motiv och tryck kan stödja ”rolig”; helt blanka basplagg och oombedda julplagg utesluts. Se `SEARCH_FEEDBACK.md`.
- Favoriter: hjärtan, rosa markerade kort, mjuk omflyttning, favoritlista och förslag som tar hänsyn till favoriter. Lokalt lagras endast offentliga produkt-ID:n. Se `FAVORITES.md`.
- Studio: `/studio.html` är en interaktiv skiss med tio offentliga produktexempel. Rolig, Söt och Sportig kan väljas samtidigt med ett klick per tagg. Färg kan bekräftas, felanmälas eller föreslås rättad. Fördjupning, testroller, granskningshistorik och JSON-export finns. Se `STUDIO.md`.
- Studio sparar bedömningar endast i den aktuella flikens minne. Ett godkännande i skissen skriver inte till riktig katalog eller sökning. Omladdning eller stängning tappar dessa bedömningar; sparade förslag kan exporteras som JSON.
- Riktiga konton och kontofavoriter är förberedda i kod men fortsatt avstängda i Preview. Kontoschemat är ett förslag och ska inte antas vara tillämpat. Se `ACCOUNTS.md`.

## Vercel och beroenden till den lokala datorn

Vercel-projektet är `ai-shopping-api`. GitHub-integrationen bygger Preview från utvecklingsgrenen. `vercel.json` och byggskriptet finns i repositoryt. Teamet och miljökonfigurationen är redan etablerade; skapa inte ett nytt projekt för att fortsätta arbetet.

Verifierad Preview för taggningsändringen:
https://ai-shopping-4x6z07mw4-adamodelfelt-3869s-projects.vercel.app/studio.html

Vercel-demon körs i molnet och fortsätter fungera när den lokala datorn stängs av. Den skyddade delningslänken finns i ägarens chatt och gäller till söndag 1 november 2026, cirka 23:59 svensk tid. Delningsparametrar publiceras inte i Git. Projektets inloggningsskydd är kvar.

Butikssökningen hittar kandidater i den daterade katalogkopian och verifierar sedan aktuellt pris och lager hos återförsäljaren. Okänt, för gammalt eller blockerat lager visas inte som tillgängligt. Lindex har nekat lageranrop från Vercel med HTTP 403; detta får inte ersättas med påhittat lager. Se `VERCEL_SEARCH.md` och `STOCK.md`.

Safari-kopplingen till Lindex kräver den lokala datorn, Safari-tillägget och lokal Whool. Källkod och paketering finns i Git, men en avstängd Mac kan inte utföra överföringen. Tillägget är inte en mobil- eller molnintegration. Se `extension/lindex-safari/README.md` och `SAFARI_VERIFICATION.md`.

## Miljö och säkerhetsstatus

Miljövariabler ligger i respektive driftmiljö. `.env.example` visar enbart namn och tomma platshållare. Hämta eller tillhandahåll endast de värden som en specifik uppgift behöver genom miljöns säkra konfiguration; skriv inte nycklar i kod, Git eller chatt. Produktion kräver en aktuell Supabase-katalog och delad API-kvot enligt `DEPLOYMENT.md`.

Under den tidigare incidentåtgärden bekräftades återkallelse av Supabase-legacy-nycklarna och begränsad publik katalogläsning. Säkerhetsåtgärderna är separata från denna Git-överlämning; en kodpush roterar inga nycklar. Återanvänd inte gamla nycklar eller gamla breda rättigheter. `KEY_ROTATION.md` beskriver arbetsgången, inte en uppmaning att göra om rotationen utan ny anledning.

Privata incidentunderlag, ursprungsarkiv, lokala miljöfiler, gamla Git-säkerhetskopior och exporter utanför repositoryt ingår inte i molnets källkod. De behövs inte för att utveckla eller bygga den nya demon. Underhållsimport, schemalagd insamling, verklig kontolagring och produktionsmigrering är inte aktiverade av denna överlämning.
