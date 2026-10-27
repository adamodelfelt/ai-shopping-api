# Whool – Lindex-koppling för Safari

Prototyp 0.1.0. Installerad och verifierad i Safari 27.2 den 27 oktober 2026. Ett komplett prov från tom Lindex-korg lade till SKU 9083175, storlek 134/140, antal 1, pris 399 kr och fyllde Alex Exempels fiktiva kontakt-/adressuppgifter på högst 14 sekunder. Ett separat prov återanvände en redan korrekt korg utan dubbelt tillägg. Ingen order, betalning eller leveransbekräftelse skickades. Detta bevisar inte slutförd betalning under en minut eller alla produkter/antal; fler varianter behöver provas före bred användning. Se docs/SAFARI_VERIFICATION.md i projektet.

## Installera för ett lokalt test

Safari på denna dator är version 27.2. Safari kan tillfälligt ladda mappen eller den genererade zip-filen utan Xcode:

1. Öppna Safari → Inställningar → Avancerat och visa funktionerna för webbutvecklare om de inte redan visas.
2. Gå till Utvecklare → Lägg till tillfälligt tillägg. Välj denna mapp eller `whool-lindex-safari.zip`.
3. Läs och godkänn Safaris fråga om det osignerade tillägget. Eventuell lösenords-/Touch ID-fråga måste du själv slutföra.
4. Aktivera åtkomst enbart till lokala Whool och `www.lindex.com` i tilläggets webbplatsinställningar.
5. Öppna `http://127.0.0.1:3000/` i samma Safari-profil och ladda om sidan.

Tillägget försvinner vid avslutad Safari eller efter 24 timmar. Detta är en tillfällig utvecklingsinstallation, inte en signerad App Store-version.

## Testa

Sök ett Lindex-plagg → välj en lagerförd storlek → Varukorg → lägg till en fiktiv leveransprofil → Köp hos butik → granska och välj Överför till Lindex. En ny Safari-flik öppnas. Tillägget kontrollerar befintliga varor, lägger till exakta varianter och fyller adresssteget. Kunden fortsätter i just den fliken.

Vid andra varor, avvikande pris/antal/storlek eller okänd sidstruktur stoppas överföringen. Inga befintliga varor raderas. Ett osäkert tillägg försöks inte om automatiskt. Granska Lindex-varukorgen före ett nytt försök.

## Behörigheter och data

- Endast `http://127.0.0.1`, `http://localhost` och `https://www.lindex.com`. Webbtilläggens matchmönster omfattar loopback-värdens portar, men koden accepterar bara Whool på port 3000.
- `storage`: enbart minnesbaserad `storage.session`. Ingen varaktig lagring eller synkronisering av profilen.
- `alarms`: raderar utgångna överföringar. Livslängden är tre minuter, med rensning vid nästa kontroll och senast följande minutlarm.
- Uppgifterna lämnas till butiksskriptet endast i den nyskapade, bundna Lindex-fliken och adresssteget. Andra flikar och iframes nekas.
- Kontaktuppgifter tas bort ur överföringstillståndet efter lyckad ifyllning, stopp eller avbrott. Stängd käll-/butiksflik tar bort jobbet.
- Inga API-nycklar, kundkakor, konto-token, personnummer eller betaluppgifter läses eller överförs. Profilvärden skrivs aldrig till URL eller logg.
- Inga åtgärder för beställning, betalning, medlemskap eller godkännande av butiksvillkor finns. Endast kundens valda vara kan läggas till.

Butikens formulär kan autospara de fiktiva testuppgifterna. Använd fortsatt fiktiva uppgifter tills nyckelincidenten är hanterad och kontolagringen har verifierats.

Källor: [Apples installation av Safari-webbtillägg](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension), [MDN om bakgrundsskript](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background).
