# Favoriter och träffsäkrare sökning

Rödsökning prioriterar knallrött och inkluderar normalt högst två vinröda förslag bland upp till åtta lagerkontrollerade träffar. Favoritstyrda förslag kan prioritera fler vinröda när det är den valda smaken. Leverantörens råa färgnamn bevaras vid insamling så att exempelvis Vinröd inte förloras genom normalisering till red. Några befintliga, bildgranskade mörka plagg har en separat nyanskorrigering. Den fotograferade orange Mini Rodini-byxan har en granskad färgkorrigering. Rutiga, flerfärgade och heltäckande tryck utan verifierad dominerande färg hör till utökad sökning när endast en färg efterfrågas. En uttrycklig mönstersökning kan fortfarande hitta mönstret. Orange släpps inte in i vanlig rödsökning. Ingen bildanalys påstås.

Vanlig byxsökning utesluter skal-, regn-, vadderade och vattentäta byxor, strumpbyxor och shorts. De går att hitta med sin uttryckliga plaggtyp. Dessa filter behålls även när favoriter påverkar ordningen eller när färgsökningen utökas.

Hjärtan sparar offentliga produkt-ID:n lokalt på enheten, högst 100. Inga kontaktuppgifter eller sessionstoken får gå genom lagringsadaptern. Favoritlistan i menyn finns mellan konto och varukorg. Första hjärtat visar en diskret kontouppmaning. Hjärtmarkerade resultat får rosa ton och flyttas mjukt främst i gruppen; animation stängs av när användaren föredrar minskad rörelse.

Den nedre knappen för nya förslag kombinerar lokala och, när riktig inloggning är aktiverad, kontosparade produkt-ID:n. API:et tar högst 40 referenser och härleder attribut från katalogen. Nyans, mönster, varumärke och plaggtyp prioriteras utan att sökningens hårda filter ändras. Att hjärta vinrött ökar dess vikt i denna uttryckliga rekommendationsåtgärd.

## Kontolagring

Riktig inloggning är fortfarande avstängd i den nuvarande Preview-miljön. Det lokala favoritflödet är användbart utan konto. Kontots API är förberett för privat läsning och skrivning via den verifierade sessionsägaren, med minsta behörighet och befintlig delad kvot. `db/accounts.sql` innehåller både `account_profiles` och `account_favorites` och är ett förslag för en separat verifierad kontomiljö; det har inte applicerats av denna kodändring. Befintlig kontomiljö behöver en separat granskad schemaändring innan uppdaterad API-kod aktiveras där.

En rad per användare begränsar listan till 100 giltiga produktreferenser. RLS kräver egen `auth.uid()` för både USING och WITH CHECK; anon, anonyma inloggningar och delegerade OAuth-sessioner får ingen åtkomst. Ingen administratörsnyckel används. Kontofavoriter lagras bara i sidans minne och försvinner ur vyn vid utloggning. Lokala favoriter förs över till kontot först efter uttryckligt val. Listan sparas som en helhet; vid samtidiga ändringar från flera enheter gäller senast sparade lista.

Favoriter kan behållas även när en produkt inte längre har verifierat lager, men varukorgsknappen kräver aktuellt bevis. Listan kontrollerar lager igen när den öppnas. Sökresultatens femminutersgräns och leverantörsblockeringar kvarstår.
