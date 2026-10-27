# Storlekar, lager och prototypkassor

## Vad som visas

Sökning och liknande produkter kontrollerar kandidaternas offentliga produktsidor innan de returnerar köpbara produkter. Varje visad produkt måste ha minst en verifierad, tillgänglig storlek. En numerisk storlek i sökningen matchas mot butikens tillgängliga storleksintervall. En babytröja i 50–68 visas därför inte för 110/116. Matchning av intervall betyder överlapp, inte att två butiker använder identiska storlekssystem.

Verifieringen läser produktidentitet, marknad/SEK, aktuellt pris, storleks-ID och lager per storlek. Varianten och antalet kontrolleras även innan demokassorna öppnas. Lagerevidens återanvänds högst fem minuter; föråldrade eller okända uppgifter godtas inte som köpbara. Om en sida blockerar åtkomst eller ändrar format döljs produkten. Inget saknat lager antas vara tillgängligt. En butik kan ändra sitt lager efter kontrollen; ingen reservation görs.

Mini Rodini, Polarn O. Pyret, Newbie, Lindex och Tretorn har verifierats med offentliga produktsidor och testfixturer. ARKET gav HTTP 403 i denna körning. Endast explicita, verifierbara storlekserbjudanden accepteras där; åtkomstspärren kringgås inte och produkterna får okänd lagerstatus. Inga butiksinloggningar, kundkakor eller gamla API-nycklar används.

Kontrollen följer robots-regler, begränsar svarsstorlek och tid, blockerar omdirigeringar och främmande värdar samt köar anrop per butik. Samtidiga kontroller av samma produkt delar förfrågan. Stock-API:t accepterar enbart kända produkt-ID:n, aldrig godtyckliga URL:er. Anropet innehåller inga leverans- eller betaluppgifter.

## Kör skriptet

```sh
npm run stock:check -- --query 'randiga tröjor' --limit 24
npm run stock:check -- --limit 4000
```

Utan sökfråga kontrolleras den lokala katalogen upp till gränsen. En stor körning kan ta lång tid; äldre resultat måste ändå kontrolleras om när femminutersgränsen har passerats. Skriptet sparar endast normaliserade storlekar och lagerstatus i den Git-ignorerade filen `data/stock.json` genom atomiskt filbyte. Appen kontrollerar automatiskt saknad eller gammal evidens när produkter efterfrågas; skriptet är också användbart inför en demo eller en kataloggranskning. Ingen schemalagd körning skapas automatiskt.

## Prototypflödet

Varukorg → välj storlekar och antal → Till kassan → gemensam leveransprofil → Till butikskassorna – demo. Det sista steget öppnar en separat demokassa med varor, storlekar, kontaktuppgifter och val av simulerat betalsätt. Slutför demoköp visar en bekräftelse och leder till nästa butik. Det skapas aldrig riktiga butikskorgar, ordrar eller betalningar. Produkt- och profiländringar rensar berörda förhandsvisningar och demobekräftelser.

Randig krage, V-ringning, ribbade kanter eller enstaka dekorativa ränder räknas inte ensamma som att hela plagget är randigt. Det gäller även äldre felaktiga `striped`-taggar. Klassificeringen utgår från butikens text, utan att påstå att automatisk bildanalys har utförts.

## Begränsat prototypsortiment

Den publika prototypen använder en gemensam tillåtelselista i `public/retailers.js`: Mini Rodini, Polarn O. Pyret, Newbie, Lindex och Tretorn. ARKET är bortfiltrerat före sökning, liknande produkter och direkta lagerförfrågningar, även om katalogen eller en tidigare lagercache fortfarande innehåller produkten. Det utlöser heller inga externa lageranrop och kan inte förberedas som demokassa. Arkiverade produktdata och generella import-/parserfixturer behålls.

Urvalskravet är ett fungerande, tidsmätt flöde från en hittad, lagerkontrollerad produkt till slutförd **simulerad** betalning på mindre än 60 sekunder. Lagersteget vid övergången till kassan begränsas till åtta sekunder på servern, med tio sekunders klientgräns inklusive svarstid. Ett positivt tidigare lagersvar återanvänds högst fem minuter. Överskriden tidsgräns eller okänd storlek öppnar ingen butikskassa.

Mätningen avser ett representativt flöde per varumärke i denna lokala prototyp, med fiktiv leveransprofil och utan riktiga betalningar. Det är ingen garanti för mänsklig inmatningstid eller för betalningsflöden på återförsäljarnas egna webbplatser. Nytt varumärke måste läggas till uttryckligen efter motsvarande kontroll.

## Köp hos butik – Lindex

För Lindex finns knappen **Köp hos butik** i varukorgen, butikens del av Whools kassa och den lokala demokassan. Den kontrollerar Safari-tillägget och visar installation om kopplingen saknas. Efter färsk lagerkontroll och förhandsgranskning av produkter och profil kan användaren välja **Överför till Lindex**.

Tillägget öppnar en ny butiksflik i samma Safari-profil, kontrollerar befintlig varukorg, lägger till exakta varianter och fyller adresssteget. Orelaterade varor eller avvikelser stoppar flödet; inga befintliga varor raderas. Beställning och betalning lämnas till användaren. Profiluppgifter ligger aldrig i länkar.

Koden, installationen och ett komplett prov i Safari 27.2 är verifierade den 27 oktober 2026: tom Lindex-korg → SKU 9083175 i storlek 134/140, antal 1, 399 kr → automatiskt ifyllda fiktiva kontakt- och adressfält på högst 14 sekunder. En redan korrekt korg återanvändes i ett separat prov. Ingen verklig order, betalning eller leveransbekräftelse skickades. Fler produkter/antal och slutförd betalning under en minut är inte verifierade. Se [tilläggets instruktioner](../extension/lindex-safari/README.md).
