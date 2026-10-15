// Kilpailurekisteri: selaimeen tallennettu lista näytetään heti, tuore haetaan taustalla /api/rekisteri-osoitteesta.
import { useEffect, useState } from 'react';
import { onkoCsvVirheellinen, parseCsvRows } from '../utils/csv';
import { tulkitseLippu } from '../utils/devTila';
import { parsiKilpailurekisteri } from '../utils/kilpailurekisteri';
import { lueRekisteri, tallennaRekisteri } from '../utils/paikallinenValimuisti';

function onkoPreviewOverrideAktiivinen() {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search || '');
    return tulkitseLippu(params.get('preview') || params.get('showHidden')) === true;
  } catch {
    return false;
  }
}

function naytetaankoPiilotetutKisat() {
  return tulkitseLippu(import.meta.env.VITE_SHOW_HIDDEN_COMPETITIONS) === true || onkoPreviewOverrideAktiivinen();
}

function naytettavatKisatRekisterista(csvText, naytaPiilotetut) {
  const kisat = parsiKilpailurekisteri(parseCsvRows(csvText));
  return naytaPiilotetut ? kisat : kisat.filter((kisa) => !kisa.piilotettu);
}

export function useKilpailurekisteri() {
  const [tallennettuRekisteri] = useState(() => lueRekisteri());
  // Osoite ja ympäristö eivät muutu sivun aikana, joten asetus luetaan kerran.
  const [onkoPiilotettujenKisojenOverride] = useState(naytetaankoPiilotetutKisat);
  const [kisat, setKisat] = useState(() => (
    tallennettuRekisteri ? naytettavatKisatRekisterista(tallennettuRekisteri.csv, onkoPiilotettujenKisojenOverride) : []
  ));
  const [ladataanKisalista, setLadataanKisalista] = useState(() => !tallennettuRekisteri);
  const [virhe, setVirhe] = useState(null);

  useEffect(() => {
    let peruttu = false;

    async function haeKisalistaCsv() {
      try {
        const response = await fetch('/api/rekisteri');
        if (!response.ok) {
          throw new Error(`Kilpailurekisterin haku epäonnistui: ${response.status}`);
        }
        const csvText = await response.text();
        if (onkoCsvVirheellinen(csvText, 10)) throw new Error('Kilpailurekisteri on tyhjä tai virheellinen');
        if (peruttu) return;

        setKisat(naytettavatKisatRekisterista(csvText, onkoPiilotettujenKisojenOverride));
        setVirhe(null);
        tallennaRekisteri(csvText);
      } catch (error) {
        console.error("Virhe kilpailurekisterin haussa:", error);
        // Tallennettu lista jää näkyviin, jos sellainen on.
        if (!peruttu && !tallennettuRekisteri) setVirhe("Kilpailurekisterin lataus epäonnistui.");
      } finally {
        if (!peruttu) setLadataanKisalista(false);
      }
    }

    haeKisalistaCsv();
    return () => {
      peruttu = true;
    };
  }, [onkoPiilotettujenKisojenOverride, tallennettuRekisteri]);

  return { kisat, ladataanKisalista, virhe };
}
