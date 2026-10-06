# Sheets mallipohjat

Tama kansio sisaltaa valmiit CSV-mallit Google Sheets -valilehdille.

## Tiedostot

- KISANSPEKSIT_template.csv
- Aikataulu_group_template.csv
- Aikataulu_inline_template.csv

## Kaytto

1. Avaa kilpailun sheet.
2. Luo valilehti KISANSPEKSIT ja liita sisalto tiedostosta KISANSPEKSIT_template.csv.
3. Luo valilehti Aikataulu (tai Aikataulu La / Aikataulu Su) ja liita jompikumpi aikataulumalli.
4. Vaihda oikeat kilpailija- ja rata-arvot.

## Tarkeat asetukset KISANSPEKSIT-valilehdella

- AIKATAULU_MALLI: GROUPS tai INLINE
- AIKATAULU_RYHMITTELY: 5, 6 tai INLINE
- AIKATAULU_NAKYVYYS: ALWAYS, AFTER_START tai OFF
- RATKO_PALKINTO_SIJA: montako OPEN-palkintosijaa ratkaistaan ratkolla (oletus 3, jos tyhja tai puuttuu)

## Huomiot

- GROUPS + 5/6 aktivoi erillisen ryhmaaikataulunakyman.
- INLINE nayttaa nykyisen in-line taulukkomallin.
- Paiva 1 voidaan piilottaa automaattisesti ryhmanakymaassa, kun kilpailun aloituspaiva on ohi.
