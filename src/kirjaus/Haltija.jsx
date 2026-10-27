// Radan vaihdon näkymät: rata toisella laitteella (PIN-kysely), tämä laite korvattu tai rata luovutettu,
// ja siirto-QR-koodi uudelle laitteelle.
import { useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';

// Siirtolinkki on yleensä alle 600 merkkiä; pidempi QR-koodi on tiheä ja vaatii hyvän kameran.
const TIHEA_QR = 1200;

function PinLomake({ onOta, painike }) {
  const [pin, setPin] = useState('');
  const [viesti, setViesti] = useState('');
  const [odottaa, setOdottaa] = useState(false);
  const laheta = async (e) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(pin)) {
      setViesti('PIN-koodissa on 4 numeroa.');
      return;
    }
    setOdottaa(true);
    const tulos = await onOta({ pin });
    setOdottaa(false);
    if (tulos.virhe) {
      setViesti(`${tulos.virhe}${Number.isInteger(tulos.yrityksia) ? ` (${tulos.yrityksia} yritystä jäljellä)` : ''}.`);
      setPin('');
    }
  };
  return (
    <form className="flex flex-col gap-2" onSubmit={laheta}>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Kilpailutoimiston vaihto-PIN
        <input
          className="rounded border border-slate-400 p-2 text-center font-mono text-2xl tracking-widest"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
        />
      </label>
      {viesti && <p className="text-sm text-red-700">{viesti}</p>}
      <button type="submit" disabled={odottaa} className="rounded bg-blue-800 px-4 py-3 text-lg font-semibold text-white disabled:opacity-50">
        {odottaa ? 'Otetaan…' : painike}
      </button>
    </form>
  );
}

// tyyppi: 'varattu' (toinen laite kirjaa), 'korvattu' (rata otettiin tältä laitteelta) tai 'luovutettu' (tämä luovutti).
export function HaltijaNakyma({ tyyppi, haltija, korvattu, lahettamatta, laitteenNimi, onOta, onPaivita, onVaihda, onLataaLoki }) {
  const [viesti, setViesti] = useState('');
  const toinen = haltija && !haltija.vapaa && !haltija.oma
    ? `${haltija.nimi || 'toinen laite'}${haltija.otettu ? `, otettu ${haltija.otettu}` : ''}`
    : '';
  const otaTakaisin = async () => {
    setViesti('');
    const tulos = await onOta();
    if (tulos.virhe) setViesti(tulos.virhe === 'Rata on käytössä toisella laitteella' ? 'Rata on jo toisella laitteella: tarvitset PIN-koodin.' : tulos.virhe);
  };

  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-3 p-4">
      {tyyppi === 'varattu' && (
        <>
          <h2 className="text-lg font-bold text-amber-800">Rata on käytössä toisella laitteella</h2>
          <p>Radan tuloksia kirjaa {toinen || 'toinen laite'}. Yksi laite kirjaa rataa kerrallaan.</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Jos se laite on vielä käytössä: valitse siinä ☰ › <b>Luovuta rata</b> ja paina sitten tässä <b>Yritä uudelleen</b>.
              Ilman verkkoa valitse siinä ☰ › <b>Siirrä QR-koodilla</b> ja skannaa koodi tällä laitteella.</li>
            <li>Jos laite on rikki tai poissa: pyydä kilpailutoimistosta radan vaihto-PIN.</li>
          </ul>
          {haltija?.lukittu
            ? <p className="rounded bg-red-100 p-2 text-sm text-red-800">Liian monta väärää PIN-koodia. Kilpailutoimisto avaa vaihdon näyttämällä PIN-koodit uudelleen.</p>
            : <PinLomake onOta={onOta} painike="Ota rata tälle laitteelle" />}
          <button type="button" className="rounded border border-slate-400 px-4 py-2" onClick={onPaivita}>Yritä uudelleen</button>
        </>
      )}
      {tyyppi === 'korvattu' && (
        <>
          <h2 className="text-lg font-bold text-red-800">Laite korvattu</h2>
          <p>
            {korvattu?.vapaa || !toinen ? 'Rata on vapautettu toiselle laitteelle.' : `Rata on siirretty toiselle laitteelle (${toinen}).`}
            {' '}Tämä laite ei enää lähetä tuloksia.
          </p>
          {korvattu?.taydennetty > 0 && (
            <p className="text-sm">
              {korvattu.taydennetty} {korvattu.taydennetty === 1 ? 'kortti' : 'korttia'} välitettiin radan nykyiselle laitteelle:
              se täyttää tämän laitteen merkinnöillä kiekot, jotka siellä ovat vielä tyhjiä.
            </p>
          )}
          {korvattu?.kirjattu > 0 && (
            <p className="text-sm">
              {korvattu.kirjattu} {korvattu.kirjattu === 1 ? 'kortti poikkesi' : 'korttia poikkesi'} taulukosta: ne kirjattiin
              kilpailutoimiston tarkistettaviksi (MOBIILI_LOKI). Paperikortti ratkaisee.
            </p>
          )}
          {lahettamatta > 0 && <p className="text-sm text-slate-700">Laitteen merkinnät ovat tallessa: lataa merkintäloki tarvittaessa.</p>}
        </>
      )}
      {tyyppi === 'luovutettu' && (
        <>
          <h2 className="text-lg font-bold">Rata luovutettu</h2>
          <p>Tämä laite on lopettanut radan kirjauksen. Uusi laite jatkaa skannaamalla radan QR-koodin.</p>
        </>
      )}
      {tyyppi !== 'varattu' && (
        <>
          <button type="button" className="rounded border border-blue-800 px-4 py-3 font-semibold text-blue-900" onClick={otaTakaisin}>
            Ota rata takaisin tälle laitteelle
          </button>
          {viesti && <p className="text-sm text-red-700">{viesti}</p>}
          {viesti && <PinLomake onOta={onOta} painike="Ota rata PIN-koodilla" />}
        </>
      )}
      <p className="text-xs text-slate-500">Tämä laite: {laitteenNimi}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded border border-slate-400 px-4 py-2" onClick={onVaihda}>Vaihda ratakoodi</button>
        <button type="button" className="rounded border border-slate-400 px-4 py-2" onClick={onLataaLoki}>Lataa merkintäloki</button>
      </div>
    </section>
  );
}

export function SiirtoNakyma({ linkki, lahettamatta, onValmis, onPeru }) {
  const kuva = useMemo(() => {
    try {
      const qr = qrcode(0, linkki.length > TIHEA_QR ? 'L' : 'M');
      qr.addData(linkki);
      qr.make();
      return qr.createDataURL(6, 4);
    } catch {
      return null;
    }
  }, [linkki]);
  return (
    <section className="mx-auto flex w-full max-w-md flex-col items-center gap-3 p-4 text-center">
      <h2 className="text-lg font-bold">Siirrä rata toiselle laitteelle</h2>
      <p className="text-sm">
        Skannaa koodi uuden laitteen kameralla. Uusi laite saa radan ja {lahettamatta > 0 ? `${lahettamatta} lähettämätöntä korttia` : 'linjan tilan'};
        se tarvitsee verkkoa kerran radan tietojen hakuun.
      </p>
      {kuva
        ? <img src={kuva} alt="Siirto-QR-koodi" className="w-full max-w-xs bg-white [image-rendering:pixelated]" />
        : <p className="text-red-700">Koodi on liian suuri. Lähetä kortit verkossa ja käytä Luovuta rata.</p>}
      {linkki.length > TIHEA_QR && <p className="text-xs text-amber-800">Koodi on tiheä: pidä kamera lähellä ja näyttö kirkkaana.</p>}
      <button type="button" className="w-full rounded bg-blue-800 px-4 py-3 text-lg font-semibold text-white" onClick={onValmis}>
        Uusi laite jatkaa: lopeta tällä laitteella
      </button>
      <button type="button" className="w-full rounded border border-slate-400 px-4 py-2" onClick={onPeru}>Peruuta</button>
    </section>
  );
}
