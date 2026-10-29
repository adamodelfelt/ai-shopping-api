# Sökning med aktuellt lager i Vercel Preview

Sökningen använder katalogkopian för att hitta kandidater och kontrollerar därefter pris, produktidentitet och enskilda storlekar hos återförsäljaren. Endast verifierat lager yngre än fem minuter visas. Inspelade storlekar och syntetiska lageruppgifter används inte.

Sökningen prövar fler kandidater när de första saknar verifierbart lager eller rätt storlek. Den behåller sökord, mönster, barnmålgrupp, varumärke och exkluderade produktreferenser. Den får högst 32 kandidater per grupp och kontrollerar sammanlagt högst 48 unika produkter inom 28 sekunder, med högst åtta träffar per grupp. Grupperna får turas om i omgångar om fyra kandidater.

En lagerkontroll återanvänder butikens robots-regler och begärandetakt inom samma omgång. HTTP 403/429 stoppar fortsatta kontroller mot butiken i minst en minut. Nätfel och enskilda timeouter ger en kort paus. En avbruten sökning startar inga nya lageranrop. Övriga butiker kan fortfarande kontrolleras, och okänt lager visas aldrig som tillgängligt.

Lindex har observerats svara HTTP 403 på anrop från Vercel. Det är en extern begränsning; inga proxyer, ändrade identiteter eller åtkomstskydd kringgås. Sökningen informerar när en butiks lager inte kunde verifieras. Sökning på ett uttryckligt varumärke byter inte i smyg till ett annat varumärke.

Mini Rodini, Polarn O. Pyret, Newbie och Tretorn gav före ändringen aktuella sökträffar i Vercel-webbläsartest. Efter varje deployment ska aktuell preview kontrolleras igen med en bred sökning, en uttrycklig varumärkessökning och ett blockerat leverantörsfall. En fungerande Lindex-integration i drift kräver fortfarande godkänd datatillgång.

Detta är en skyddad Preview. Produktionskraven på delad API-kvot och live-katalog kvarstår. Den lokala Safari-kopplingen ändras inte.
