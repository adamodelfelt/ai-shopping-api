# Bevarade funktioner och avgränsningar

| Funktion | Ny implementation | Verifiering |
| --- | --- | --- |
| Flera plagg i en fråga, svenska/engelska | Gruppering med bevarade sammansatta attribut | Automatiska tester och webbsökning |
| Färg, plagg, baby/barn, tryck, mönster, motiv, märke | Hårda filter och regelstyrd tolkning | Automatiska tester mot syntetiska fall och rensad katalog |
| Märkesord och stilreferenser | Endast godkända, daterade kopplingar; mjuk rankning | Automatiska tester; ordlistor bevarade som data |
| Märkesvariation och variantdeduplicering | Urval från alla hämtade sidor, upp till 8 resultat | Test med över 1 000 kandidater |
| Visa 4/8, fästa, nya förslag, redigera | Webbsidans minne | Tillståndstester och manuell webbläsarkontroll |
| Utöka sökning | Närliggande färger inom samma plaggtyp; övriga filter kvar | Automatiska filtertester |
| Liknande plagg från flera märken | Katalogattribut; ingen bildanalys | Automatiska tester och webbläsarkontroll |
| Mina val, totalsumma, handla | Lista och separata säkra butikslänkar | Webbläsarkontroll |
| Sex barnscraprar | Nya parsrar, robotregler, sidkontroll och täckningsspärr | Arkiverade råfixtures; ingen fullständig färsk butikshämtning genomförd |
| Import, klassificering, märkesprofiler | Separat CLI, backup, förhandsplan och explicit applicering | Plan- och parsertester; inga levande importer genomförda |
| RLS och kolumnrättigheter | Granskningsbart SQL-förslag | Testat mot befintligt schema i återställd transaktion; ej permanent applicerat |

Medvetna skillnader: allmän AI-tolkning av okända fraser är ersatt av deterministiska regler. Sökningar som inte stöds ger vägledning och inga påhittade produkter. Äldre vuxenscraprar för ASKET/CDLP/HOPE har inte förts över, eftersom den aktiva produkten och databassökningen endast visar barnrelaterad katalog. ASKET/CDLP:s märkesprofiler finns kvar som data för stilreferenser. Webbens marknadsföring lovar därför barnkläder, inte vuxenkläder eller bröllopsinköp.

Den äldre slumpmässiga AI-produktgeneratorn i en separat Supabase Edge Function är borttagen ur denna kod. En redan driftsatt gammal funktion måste avaktiveras separat. Gamla API-arkivfiler, oanvända UI-paket och den tidigare localhost-kopplingen ingår inte i den nya servern.

Återförsäljarnas publika strukturer kan ändras. Fixtures visar att koden hanterar dokumenterade strukturer; de bevisar inte att alla aktuella sajter fungerar idag. Kör en färsk komplett insamling och granska rapporten före schemalagd import. Den lokala förhandsvisningens 3 592 produkter är rensade från arkivet och har lokala, syntetiska produkt-ID:n.

## Konton och checkoutunderlag

Kontoprofil, e-postkod via konfigurerbar Supabase Auth och en lokal demokassa tillkom den 27 oktober 2026. Se `docs/ACCOUNTS.md`. API och RLS har testats, men verklig kontolagring är avstängd tills säker kontomiljö och e-postleverans är konfigurerade. Ingen adapter till en extern butik är aktiverad. Arbetsfilerna `Whool-checkout-arbetsfiler-v0.1.zip` innehåller historiska manuella tester och ett kontraktsförslag, inte en färdig agent.
