// src/IlmoittautumisLomake.jsx
// Ilmoittautumislomake tuleviin kisoihin, joissa KISANSPEKSIT ILMOITTAUTUMINEN = LOMAKE (Suomisportin sijaan).
// Lähettää api/ilmoittaudu.js:lle, joka kirjoittaa ILMOITTAUTUMISET-välilehdelle. Kentät ja tarkistukset
// src/utils/ilmoittautumiset.js (samat palvelimella).
import { useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './components/ui/card';
import { Button } from './components/ui/button';
import { haeTekstit } from './i18n';
import { KENTTA_MAKS, tarkistaLomake } from './utils/ilmoittautumiset';

const TYHJA = { sukunimi: '', etunimi: '', sarja: '', seura: '', sahkoposti: '', puhelin: '', lisatietoja: '', suostumus: false, kotisivu: '' };

const VIRHE_TEKSTI = { pakollinen: 'errRequired', virheellinen: 'errEmail', tuntematon: 'errClass' };
const PALVELIN_VIRHE = { kaksoiskappale: 'errDuplicate', suljettu: 'errClosed', eiKaytossa: 'errClosed', liianNopea: 'errTooFast', liianMonta: 'errTooMany' };

const kenttaLuokka = 'w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]';

function muotoileTakaraja(takaraja, locale) {
  if (!takaraja) return '';
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fi-FI', {
    timeZone: 'Europe/Helsinki', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(takaraja);
}

// tila: lomakkeenTila (kaytossa, auki, takaraja, sarjat). onIlmoittauduttu({ nimi, sarja, seura }) näyttää nimen
// listassa heti, ennen kuin API:n välimuisti päivittyy.
export default function IlmoittautumisLomake({ sheetId, tila, locale = 'fi', onIlmoittauduttu }) {
  const tx = haeTekstit('ilmoittautuminen', locale);
  const [auki, setAuki] = useState(false);
  const [arvot, setArvot] = useState(TYHJA);
  const [virheet, setVirheet] = useState({});
  const [viesti, setViesti] = useState('');
  const [lahetetaan, setLahetetaan] = useState(false);
  const [valmis, setValmis] = useState(false);
  const avattuRef = useRef(0);

  if (!tila?.auki) return null;

  const avaa = () => {
    avattuRef.current = Date.now();
    setAuki(true);
    setValmis(false);
    setViesti('');
  };

  const aseta = (kentta) => (e) => {
    const arvo = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setArvot((a) => ({ ...a, [kentta]: arvo }));
    setVirheet((v) => ({ ...v, [kentta]: undefined }));
  };

  const laheta = async (e) => {
    e.preventDefault();
    if (lahetetaan) return;
    const tarkistus = tarkistaLomake(arvot, tila.sarjat);
    setVirheet(tarkistus.virheet);
    if (Object.keys(tarkistus.virheet).length) return;
    setLahetetaan(true);
    setViesti('');
    try {
      const vastaus = await fetch('/api/ilmoittaudu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...arvot, sheetId, kesto: Date.now() - avattuRef.current })
      });
      const data = await vastaus.json().catch(() => ({}));
      if (vastaus.ok && data.ok) {
        if (data.nimi) onIlmoittauduttu?.({ nimi: data.nimi, sarja: data.sarja || '', seura: data.seura || '' });
        setValmis(true);
        setArvot(TYHJA);
        return;
      }
      if (data.koodi === 'virheet' && data.virheet) setVirheet(data.virheet);
      setViesti(tx[PALVELIN_VIRHE[data.koodi]] || (data.koodi === 'virheet' ? '' : tx.errGeneric));
    } catch {
      setViesti(tx.errGeneric);
    } finally {
      setLahetetaan(false);
    }
  };

  const virheId = (kentta) => `ilmo-virhe-${kentta}`;
  const virhe = (kentta) => (virheet[kentta]
    ? <p id={virheId(kentta)} className="mt-1 text-xs text-rose-600">{kentta === 'suostumus' ? tx.errConsent : tx[VIRHE_TEKSTI[virheet[kentta]]] || tx.errRequired}</p>
    : null);
  const virheTila = (kentta) => ({ 'aria-invalid': Boolean(virheet[kentta]), 'aria-describedby': virheet[kentta] ? virheId(kentta) : undefined });

  const kentta = (nimi, otsikko, props = {}) => (
    <div className="text-sm">
      <label className="block">
        <span className="mb-1 block font-medium text-[hsl(var(--foreground))]">{otsikko}</span>
        <input className={kenttaLuokka} value={arvot[nimi]} onChange={aseta(nimi)} maxLength={KENTTA_MAKS[nimi]} {...virheTila(nimi)} {...props} />
      </label>
      {virhe(nimi)}
    </div>
  );

  return (
    <Card className="border-slate-200">
      <CardHeader className="gap-1 pb-4">
        <CardTitle className="text-xl">{tx.title}</CardTitle>
        <CardDescription>{tx.description.replace('{aika}', muotoileTakaraja(tila.takaraja, locale))}</CardDescription>
      </CardHeader>
      <CardContent>
        {valmis ? (
          <div className="space-y-3" role="status">
            <p className="font-medium text-emerald-700">{tx.done}</p>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">{tx.doneDetail}</p>
            <Button variant="outline" size="sm" onClick={avaa}>{tx.another}</Button>
          </div>
        ) : !auki ? (
          <Button onClick={avaa}>{tx.open}</Button>
        ) : (
          <form className="space-y-3" onSubmit={laheta} noValidate>
            <div className="grid gap-3 sm:grid-cols-2">
              {kentta('sukunimi', tx.lastName, { autoComplete: 'family-name', required: true })}
              {kentta('etunimi', tx.firstName, { autoComplete: 'given-name', required: true })}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {tila.sarjat.length ? (
                <div className="text-sm">
                  <label className="block">
                    <span className="mb-1 block font-medium text-[hsl(var(--foreground))]">{tx.class}</span>
                    <select className={kenttaLuokka} value={arvot.sarja} onChange={aseta('sarja')} {...virheTila('sarja')} required>
                      <option value="">{tx.chooseClass}</option>
                      {tila.sarjat.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                  {virhe('sarja')}
                </div>
              ) : kentta('sarja', tx.class, { required: true })}
              {kentta('seura', tx.club, { autoComplete: 'organization', required: true })}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {kentta('sahkoposti', tx.email, { type: 'email', autoComplete: 'email', inputMode: 'email', required: true })}
              {kentta('puhelin', tx.phone, { type: 'tel', autoComplete: 'tel', inputMode: 'tel' })}
            </div>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-[hsl(var(--foreground))]">{tx.notes}</span>
              <textarea className={kenttaLuokka} rows={3} value={arvot.lisatietoja} onChange={aseta('lisatietoja')} maxLength={KENTTA_MAKS.lisatietoja} />
            </label>
            {/* Piilokenttä roskapostibotteja varten: ihminen ei näe eikä täytä sitä. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>Kotisivu<input tabIndex={-1} autoComplete="off" value={arvot.kotisivu} onChange={aseta('kotisivu')} /></label>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={arvot.suostumus} onChange={aseta('suostumus')} {...virheTila('suostumus')} />
              <span>{tx.consent}</span>
            </label>
            {virhe('suostumus')}
            {viesti && <p className="text-sm font-medium text-rose-600" role="alert">{viesti}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={lahetetaan}>{lahetetaan ? tx.sending : tx.submit}</Button>
              <Button type="button" variant="outline" onClick={() => setAuki(false)} disabled={lahetetaan}>{tx.cancel}</Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
