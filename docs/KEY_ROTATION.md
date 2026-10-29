# Nyckelbyte

En ombyggnad eller ny miljövariabel återkallar inte en gammal nyckel. Bytet är färdigt först när den nya konfigurationen fungerar och den gamla behörigheten nekas av leverantören. Ägarens separata incidentrapport anger vilka nycklar som faktiskt hittades och vilka projekt de hör till. Skriv aldrig hemliga värden i Git, Dropbox, chatt, skärmbilder eller denna guide.

| Tidigare variabel / tjänst | Åtgärd | Var den nya konfigurationen ska ligga |
| --- | --- | --- |
| `SUPABASE_KEY` med legacy `service_role` | Skapa en ny publishable-nyckel för läsning och en separat secret-nyckel för import. Flytta konsumenterna och **avaktivera gamla legacy-nycklar** i Supabase Settings → API Keys. | `SUPABASE_PUBLISHABLE_KEY` på webbservern; `SUPABASE_IMPORT_SECRET_KEY` endast i lokal hemlighetsfil och skyddad GitHub Environment. |
| `OPENAI_API_KEY` | Återkalla den potentiellt röjda nyckeln i OpenAI-projektets API Keys. Granska Usage. Skapa bara en ersättare om en annan tjänst fortfarande behöver OpenAI. | Ingen i denna implementation. Andra tjänsters nya nycklar ska ligga i respektive hemlighetslager. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` / äldre `anon` | Publik nyckel, inte en administratörshemlighet. Inventera det äldre frontendprojektet och dess RLS; ta bort kopplingen om projektet inte längre används. | Ingen Supabase-nyckel i den nya frontendkoden. |
| `SUPABASE_SERVICE_ROLE_KEY` i äldre CI | Byt till ny separat importnyckel och ta bort den äldre CI-hemligheten när ingen konsument behöver den. | GitHub Environment `catalogue-maintenance`, ny variabel `SUPABASE_IMPORT_SECRET_KEY`. |
| `VERCEL_OIDC_TOKEN` i lokal miljöfil | En tidsbegränsad OIDC-token ska inte återanvändas. Kontrollera utgångstid och eventuella förtroenderelationer/integrationer. | Ingen i projektet; plattformen utfärdar kortlivade token vid behov. |
| `LOVABLE_API_KEY` i eventuell äldre Edge Function | Nyckelvärdet finns inte i den granskade koden, men funktionen refererar till hemligheten. Avaktivera överflödig funktion och återkalla/rotera hemligheten om den kan ha exponerats. | Ingen i den nya implementationen. |
| GitHub PAT, SSH-privatnyckel, Vercel deploytoken, databaslösenord | Inga sådana värden identifierades i granskningen. Om den berörda enheten eller kontosessioner också misstänks komprometterade: inventera och rotera där de faktiskt används. | Leverantörens hemlighetslager/nyckelring, inte repositoryt. |
| Ny Redis REST-token | Nytt driftberoende för delad kvot i produktion; skapa egen databas och token. | `RATE_LIMIT_URL`, `RATE_LIMIT_TOKEN` endast på API-servern. |

## Ordning

1. Vid aktiv misstänkt användning: återkalla den berörda hemligheten omedelbart och acceptera vid behov ett driftstopp. Annars kan nya nycklar provisioneras och konsumenter flyttas under ett kort, kontrollerat bytesfönster.
2. Skapa nya Supabase-nycklar. Härda läs- och skrivrättigheter enligt `db/hardening.sql`; testa enligt `db/verify.sql`.
3. Uppdatera nya deploymentens miljövariabler och underhållsmiljön i GitHub. Inventera äldre deployer, lokala `.env*`, Edge Functions och schemalagda jobb så att ingen fortsatt använder legacy-nycklarna.
4. Driftsätt den granskade versionen i Preview, verifiera läsning och flöden, flytta sedan trafik. Produktionssökningen ska kunna köras helt utan service-/secret-nyckel.
5. Avaktivera legacy API keys i Supabase. **Att enbart skapa en `sb_secret_…`-nyckel lämnar den gamla `service_role`-nyckeln giltig.** RLS stoppar inte en kvarvarande privilegierad nyckel.
6. Verifiera ett gammalt autentiseringsförsök från en säker lokal administratörsmiljö. Förvänta autentiseringsfel, typiskt HTTP 401/403, inte ett tomt godkänt katalogsvar. Använd inte nycklar i kommandoargument, URL:er eller loggar. Kontrollera samtidigt att den nya läsnyckeln fungerar och att offentliga skrivningar nekas.
7. Ta bort den återkallade hemligheten ur lokala miljöfiler och exporter. Begränsa åtkomst till det ursprungliga incidentarkivet. Granska Dropbox-versioner, delningar och papperskorg utan att förstöra incidentbevis. Planera separat eventuell historiksanering om hemligheter hittas i andra Git-grenar eller fjärrhistorik.

Legacy API keys och JWT-signering är separata migrationsfrågor. En hittad `service_role`-JWT är inte samma sak som att själva JWT-signeringshemligheten har hittats. Vid misstänkt signeringshemlighet behöver även signeringsnycklar och sessioner hanteras enligt Supabases Auth-dokumentation.

## Officiella källor

- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys) och [byte från legacy-nycklar](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).
- [Supabase JWT signing keys](https://supabase.com/docs/guides/auth/signing-keys).
- [Official OpenAI documentation: återkalla komprometterade API-nycklar](https://developers.openai.com/api/docs/guides/safety-best-practices).
- [Vercel miljövariabler](https://vercel.com/docs/environment-variables) och [OIDC](https://vercel.com/docs/oidc).
- [GitHub: hantera känsliga uppgifter i historik](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).

Dokumentationen kontrollerades den 27 oktober 2026. Den här guiden utför inga rotationer och innehåller inga nyckelvärden.
