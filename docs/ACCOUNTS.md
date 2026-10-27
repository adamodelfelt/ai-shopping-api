# Konton och leveransprofil

Kontodelen finns i webbens **Mitt konto** och i **Varukorg → Leveransprofil**. Profilen omfattar förnamn, efternamn, inloggningens e-postadress, telefonnummer, gatuadress, valfri adressrad, separat C/O, svenskt postnummer och ort. Den första versionen stöder Sverige. E-postadressen hämtas från den verifierade inloggningen; den kan inte ändras genom att skriva över profilens JSON.

## Nuvarande verifierbara läge

- I en okonfigurerad miljö är riktig inloggning och serverlagring avstängda.
- **Testa med fiktiva uppgifter** skapar en tydligt märkt profil i sidans minne. Den försvinner vid omladdning. Den skickas inte till servern.
- **Prova autofyllning i demokassan** visar ett formulär inne i Whool och fyller dess fält från profilen efter ett klick. Det gör inget köp och överför inget till en extern butik.
- Säkra API-vägar för e-postkod, verifiering, profilsparning, läsning, radering och utloggning finns för konfiguration mot Supabase Auth.
- Ett separat Safari-tillägg för **Lindex** är implementerat och paketerat. Kontrakts- och bakgrundstester passerar. Tillägget är installerat i Safari 27.2 och ett flöde från tom korg till ifyllda verkliga adressfält har verifierats med fiktiv profil; se SAFARI_VERIFICATION.md. Övriga butiker har enbart demoflödet. En vanlig Whool-sida får inte ändra andra webbplatsers formulär på grund av webbläsarens origin-gränser.

Arbetsunderlaget `Whool-checkout-arbetsfiler-v0.1.zip` mottogs och granskades den 27 oktober 2026. Alla elva filer i dess SHA-256-manifest stämde. Det innehåller förstudie, historiska DOM-observationer och ett föreslaget kontrakt; ingen körbar checkoutagent. Kontraktet finns bevarat i `contracts/checkout.d.ts`. Användaren har valt ett tillägg i Safari för den första verkliga kopplingen, till Lindex. Historiska testresultat aktiverar inga adaptrar.

Demokassan har ett separat leveranspostnummer som fylls och kontrolleras mot adressen, eftersom Newbies leveransväljare enligt underlaget tidigare behöll ett gammalt postnummer. C/O är separerat från addressLine2 enligt det observerade Kustom-fältets betydelse. Dessa lokala tester bevisar inte att den nuvarande Kustom- eller Ingrid-kassan accepterar uppgifterna.

## Aktivera riktig kontolagring

Använd ett separat säkert konto-Supabase-projekt, eller verifiera först att de gamla exponerade service-/secret-nycklarna har återkallats. Den äldre incidentmiljön ska inte ta emot nya personuppgifter medan detta är olöst. En publishable-nyckel ger inte skydd mot en redan röjd service-nyckel.

1. Granska och applicera `db/accounts.sql` i den säkra databasen. Det är ett schemaförslag, inte en redan applicerad migration. Tabellen har ägarbaserat RLS, separata SELECT/INSERT/UPDATE/DELETE-policyer och både USING/WITH CHECK för ändringar. Anonyma roller och andra användare får inte läsa adressuppgifter. Tredjeparts-OAuth-klienter och anonyma Auth-sessioner tillåts inte av policyförslaget.
2. Aktivera e-postinloggning i Supabase Auth och konfigurera SMTP. Ändra Magic Link-mallen så att den innehåller `{{ .Token }}`; då får användaren koden som gränssnittet efterfrågar. Verifiera e-postleverans, OTP-gränser, tokenlivslängd och sessionsinställningar i en separat testmiljö. Ingen riktig e-post har skickats av denna implementationstestning.
3. Ange servervariablerna `ACCOUNT_SUPABASE_URL` och en ny `ACCOUNT_SUPABASE_PUBLISHABLE_KEY`. Ingen service-/secret-nyckel används av konto-API:t.
4. Konfigurera `RATE_LIMIT_URL` och `RATE_LIMIT_TOKEN` för alla miljöer där riktiga konton aktiveras. Kontotjänsten kräver delad kvot även om Vercel Preview samtidigt använder katalogkopian.
5. Sätt `ACCOUNT_AUTH_READY=true` först när dessa kontroller är klara. Behåll annars `false`.
6. Verifiera två olika användare: A kan läsa/ändra/radera sin profil; B kan inte läsa eller ändra A:s profil, inte ens genom direkta REST-anrop eller genom att skicka ett annat user_id. Verifiera också att anonym läsning och TRUNCATE nekas.

## Sessioner och data

Åtkomst- och refresh-token lagras i HttpOnly-kakor med SameSite=Strict och Secure i produktion. De returneras aldrig i JSON till webbläsarkoden och skrivs inte till localStorage/sessionStorage. Varje profilsession verifieras mot Supabase Auth innan databasanrop; profilens ägar-ID kommer från den verifierade användaren. Origin måste vara Whools egen för skrivande anrop. Leveransuppgifter, OTP, e-post och token loggas inte av applikationen.

Radera leveransuppgifter tar bort profilraden, inte själva Auth-kontot. En fullständig kontoraderingsfunktion med återkallade sessioner och hantering av e-postidentiteten är inte del av denna första leverans. Utloggning tar bort sidans profil och sessionskakor och begär återkallelse av den aktuella refresh-sessionen. Redan utfärdade access-token har Supabases vanliga återstående giltighetstid; de blir inte automatiskt ogiltiga bara för att refresh-sessionen stängs.

Profil- och sessionssvar har `Cache-Control: no-store, private`. E-postadressen dubbellagras inte i profiltabellen. Kortnummer, personnummer, lösenord till återförsäljare och betalningsuppgifter ingår inte.

## Butiksifyllning

Lindex-kopplingen visar butik, produkter och profil före användarens uttryckliga överföringsklick. Tillägget begränsas till lokala Whool på port 3000 och www.lindex.com. Personuppgifter och token läggs aldrig i URL:er. Varukorgen kontrolleras före tillägg av exakt variant; andra varor, avvikande pris, storlek eller antal stoppar flödet utan att radera butikens varukorg. Profilen lämnas endast till den bundna Lindex-flikens adresssteg och raderas ur överföringstillståndet vid klart, stopp eller avbrott. Jobb löper ut efter tre minuter. Inga beställningar, betalningar, medlemskap eller villkorsgodkännanden utförs. Se [Safari-tilläggets installations- och teststatus](../extension/lindex-safari/README.md). Externa betalnings-/Klarna-iframes kräver egen verifierad integration och ska inte antas fungera genom vanliga sidselektorer.

Källor: [Supabase e-postkod](https://supabase.com/docs/guides/auth/auth-email-passwordless), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [HTML autocomplete-fält](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/autocomplete).

## Integrerad kassa i Whool

**Varukorg → Till kassan** samlar valda produkter per återförsäljare. Storlek väljs från butikens verifierade varianter, med slutsålda storlekar avstängda. Rundade storleksknappar visas även på produktkorten och i varukorgen. Varje vald variant och antal måste ha färsk lagerkontroll innan nästa steg.

**Till butikskassorna – demo** öppnar en separat, tydligt märkt butikskassa inne i Whool. Där visas valda produkter, storlekar, antal och automatiskt ifylld gemensam leveransprofil. Användaren kan välja ett fiktivt betalsätt, slutföra demoköpet och fortsätta till nästa butik. Ingen riktig order eller betalning skapas och inga uppgifter skickas till butiken. C/O och extra adressrad behåller skilda betydelser.

Ändrad storlek, antal eller produktval rensar berörd förhandsvisning. Ändrad eller raderad leveransprofil rensar samtliga förhandsvisningar, inklusive dolda kontaktfält. Allt kundtillstånd finns endast i sidans minne. Frakt och slutpris måste bekräftas hos butiken. Se STOCK.md för skript, lagerkontroll och begränsningar.
