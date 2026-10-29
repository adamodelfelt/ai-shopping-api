# Storlekar, kroppsmått och produktmått

Sökningen tolkar exempelvis `byxor för smal sjuåring`, `byxor till 7-åring`, `byxor storlek 122/128` och `byxor 122 cm lång midja 54,5 cm`. Åldern översätts med respektive märkes guide. Angiven längd används före ålder. En åldersuppgift är ett ungefärligt storleksförslag, inte en uppmätt kroppslängd.

Alla sex märken i katalogen är kopplade till källbelagda tabeller i `config/size-guides.json`: ARKET, Mini Rodini, Polarn O. Pyret, Newbie/Kappahl, Lindex och Tretorn. Omfattningen är barn- och babykläder. Klädtabeller appliceras inte på strumpor, skor eller huvudbonader.

## Vilka uppgifter används?

1. Produktsidan identifieras med butikens artikelnummer och färg eller en verifierad kanonisk produktadress. Data från rekommenderade produkter blandas inte in.
2. Produktspecifika **plaggmått** sparas per produktadress och exakt storlek. Aktuell produktinformation läses även vid lagerkontrollen och får företräde framför den sparade kopian.
3. En **kroppstabell som produkten själv länkar till** får företräde framför märkets generella kroppstabell för samma storlek. Detta är fortfarande kroppsmått, inte uppmätta plaggmått.
4. Märkets generella kroppstabell används som vägledning när mer specifika uppgifter saknas.

Kropps- och plaggmått hålls separat hela vägen till produktkortet. Halva midje-, bröst- och stussvidder behåller sin mätbas; de behandlas inte som omkretsar. Det läggs inte till en antagen rörelsevidd. Dubbelstorlekar behåller den publicerade dubbelstorleksraden; om märket bara publicerar enkelstorlekar visas båda raderna. Könsuppdelade alternativ bevaras utan att kön antas för barnet.

För `smal` prioriteras uttrycklig justerbar midja och smal passform. Faktiska midjevidder kan också ge jämförelseunderlag och påverka rangordningen vid rätt längd/åldersstorlek. Elastisk midja eller smala byxben ensamt räcker inte som belägg. Smal passform innebär inte att en liten midjevidd är bekräftad. Ett angivet midjemått används för jämförelse med märkets kroppstabell; exakt passform utlovas inte.

Pris och tillgängliga storlekar verifieras separat enligt den befintliga lagerpolicyn. En äldre måttabell skapar aldrig lager. Även vid utökad sökning behålls storleks- och passformsvillkoren. Produktkorten visar lagerförda storleksförslag och ett utfällbart **Mått & passform** med källänkar och kontrolltidpunkt.

## Källor och kända databrister

| Märke | Officiell generell källa | Hantering |
| --- | --- | --- |
| ARKET | [Barn och baby](https://www.arket.com/sv-se/customer-service/size-guide/children/) | Kroppstabeller; alternativ med snedstreck bevaras. Produktåtkomsten nekades med HTTP 403. |
| Mini Rodini | [Storleksguide](https://www.minirodini.com/se/size-guide) | Enkla/dubbla baby- och barnstorlekar. Barnens enkelstorlekstabell upprepar bröstraden som midjerad; den midjeraden används inte. Dubbelstorlekstabellens midjemått hålls separat. |
| PO.P | [Officiell guide i cm](https://www.polarnopyret.com/en/uk/pop-magazine/kids-size-guide) | Officiell UK-kroppstabell som generell reserv. En publicerad SE-guide direkt på produkten har företräde. |
| Newbie/Kappahl | [Storleksguide barn](https://www.kappahl.com/sv-se/storleksguider/storleksguide-barn) | Baby, barn samt separata äldre pojk-/flicktabeller. X-size-tabellernas rubriker och midjemått motsäger varandra; X-size används inte för att dra slutsatsen smal. |
| Lindex | [Barnstorlekar](https://www.lindex.com/se/storlek-guider?ba=barn&hl=sv) | Pojk-/flicktabeller samt baby. Produktens egna uppgifter om justerbar resårmidja läses ur produktens `bullets`. |
| Tretorn | [Storleksguide för barn](https://se.tretorn.com/kundservice/storleksguide-for-barn) | Generell ålder/längd. Faktiska plaggmått läses ur varje produkts egen tabell. |

Tretorns måttbild bekräftar halva midje- och stussvidder för byxor: [mätbild](https://a.storyblok.com/f/339771/4168x6251/ee9cc2e913/figur_260203_kids_lowerbody.jpg). Felvärden som `453cm` och `491 cm` i barnbyxornas stusskolumn sparas som avvikelser och används inte. Ingen decimal flyttas och inget värde fylls i genom gissning.

`research/sizing-audit.json` redovisar den faktiskt genomförda kontrollen per butik: lästa produktsidor, saknade sidor, produkter med plaggmått och antal avvikande mått. `no_product_table_found` betyder att den kontrollerade produktdatans stödda fält inte innehöll en användbar tabell, inte att märket aldrig har produktmått. Saknade eller okända mätformat kräver granskning.

PO.P:s generella kroppsmått har även jämförts med den svenska kroppstabell som visas på en aktuell produktsida: samtliga 18 gemensamma måttrader stämmer. Den äldre kataloglänken till artikel `60603173` leder däremot vidare till en annan artikel, `60604188`. Den nya artikelns mått kopplas därför inte till den gamla produkten.

## Uppdatera underlaget

```sh
npm run sizing:audit
npm run sizing:reconcile
# Enstaka butik, eller en uttrycklig uppdatering av redan lästa sidor:
npm run sizing:audit -- --store=tretorn --force
npm run sizing:reconcile
```

Insamlingen respekterar robots.txt och befintlig anropspaus per butik, stannar vid 403/429 och återupptar sparade resultat med aktuell parser. Det går att begränsa kontrollen med `--limit=10` eller skriva ett separat resultat med `--output=/tmp/sizing.json`. Sammanställ med `npm run sizing:reconcile -- --merge=/tmp/sizing.json`. Kör inte flera insamlingar eller sammanställning samtidigt mot samma utdatafil.

Konfigurationen kopplas till både katalogkopian och levande sökresultat utan ändring av databasschemat. Nya och ändrade produktsidor kan kompletteras direkt vid nästa lagerkontroll. Uppdaterade sparade tabeller publiceras genom en ny driftsättning. Ingen automatisk schemaläggning eller databasimport aktiveras av denna ändring.

Lindex har även ett separat fält för produktmått. Ett kontrollerat exempel är en scarf med publicerad längd 78 cm. Sådana enstorleksmått sparas på rätt produkt; en måttuppgift utan storlekskoppling kopieras inte över till flera klädstorlekar.

## Genomförd kontroll 29 oktober 2026

3 153 av katalogens 3 592 produktsidor lästes och identifierades. Alla Mini Rodini-, Newbie-, Lindex- och Tretorn-sidor kontrollerades, liksom 740 av 741 PO.P-sidor. De 438 ARKET-sidorna nekade åtkomst; den återstående PO.P-länken leder till en annan artikel och har inte fått den artikelns mått.

Produktspecifika plaggmått hittades på 42 Tretorn-produkter och en Lindex-produkt. Åtta felvärden i Tretorns tabeller uteslöts. I övriga stödda produktfält hittades inte användbara numeriska plaggmått; märkets kroppstabell och uttryckliga produktuppgifter om passform används där.

101 tester, källkontroll och bygge passerade. Lokalt kontrollerades även sökruta → API → katalog och aktuell lagerkontroll → produktkort: `byxor för smal sjuåring` gav åtta lagerverifierade förslag, och en Tretorn-sökning visade produktens egna halva midje- och stussvidder samt innerben separat från den generella kroppsguiden. Webbläsaren rapporterade inga JavaScript-fel.
