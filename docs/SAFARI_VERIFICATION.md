# Safari – verifiering 27 oktober 2026

Flöde: Köp hos butik i Whool → Safari-tillägg → ny Lindex-flik → verifierad varukorg → ifyllda kontakt- och adressfält → användaren tar över före leverans, betalning och beställning.

| Gräns | Resultat | Evidens |
|---|---|---|
| Whool i Safari | Verifierad | Sökning efter Lindex rosa stickad tröja; 399 kr, storlek 134/140 i lager; tillagd i Whools varukorg. |
| Knapp → installation | Verifierad | Köp hos butik visar installationsvy när tillägg saknas; installerat tillägg visar produkt och profil före överföring. |
| Safari-installation/behörigheter | Verifierade | Användaren godkände installation och utförde Mac-autentisering. Åtkomst till 127.0.0.1 och Lindex tillåts i en dag. Tillfälligt tillägg 0.1.0; Safari 27.2. |
| Tom korg → exakt vara | Verifierad med riktig DOM | SKU 9083175, storlek 134/140, antal 1, 399 kr. Synlig lägg-till-bekräftelse följd av avläsning av den riktiga varukorgen. Ingen manuell assistans med produkt eller formulär under slutprovet. |
| Befintlig korrekt korg | Verifierad | Samma vara återanvändes utan dubbelt tillägg. |
| Kontakt-/adressfält | Verifierade | Alex Exempel, alex@example.com, +46 700000000, Exempelgatan 1, 12345 Exempelstad. Extra adressrad tom. Fälten lästes tillbaka och HTML-validerades. |
| Sammanhängande slutprov | Verifierat | Från Överför till Lindex med tom butikskorg till avläst klart adresssteg: högst 14 sekunder inklusive väntan mellan observationer. |
| Beställning, betalning, villkor | Inte utförda | Ingen klickning på Gå till leveranssätt eller senare steg. Ingen order skapades eller betalning godkändes. |
| Automatiska skydd | Verifierade i tester | 61 tester passerar, varav 9 för överföringen. Flikägande, ursprung, antal, pris, dubbla anrop, avbrott, utgångstid och radering av kontaktuppgifter. |

## Rättade problem under Safari-provet

- Lindex översättningssträng i ett script räknades felaktigt som lägg-till-bekräftelse. Nu krävs exakt text i en synlig notifiering.
- Storlekens kolon är CSS-genererat. Nu läses storlek ur den semantiska dt/dd-strukturen i cart-product__variant.
- Lindex e-postfält är type=text med name=email och autocomplete=email. Fältkopplingen använder dess observerade id-prefix och attribut.
- Fasta felkoder visar kontrollpunkten utan profilvärden eller loggning av uppgifterna.

Skärmbild: ../../audit/safari-lindex-filled.png. Tidigare misslyckade testflikar stängdes; den ifyllda riktiga kassan och Whool lämnades öppna. Bara den vara som vi själva lade till i testet togs bort inför slutprovet och lades sedan tillbaka av tillägget.

Begränsning: ett plagg, en storlek, ett exemplar och tom valfri adressrad testades i verklig Safari. Multiartikel, större antal, C/O och olika butikslayouter behöver ytterligare praktiska prov. En verklig betalning under en minut är inte verifierad. Den tillfälliga installationen upphör när Safari avslutas eller efter 24 timmar. Ingen signerad distribution eller produktionsdriftsättning ingår i detta prov.
