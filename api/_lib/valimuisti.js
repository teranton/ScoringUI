// Pieni avain–arvo-välimuisti: muisti ja tiedosto käyttöjärjestelmän tmp-hakemistossa.
// Tiedosto pitää välimuistin tallessa myös `vercel dev` -ajossa, jossa jokainen pyyntö käynnistää
// funktion uudessa prosessissa eikä muisti säily. Vercelissä /tmp on instanssikohtainen kuten muisti.
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const MAKS_MUISTISSA = 200;

export function luoValimuisti(nimi, { hakemisto = path.join(tmpdir(), 'scoringui-valimuisti', nimi) } = {}) {
  const muisti = new Map();
  const tiedosto = (avain) => path.join(hakemisto, `${createHash('sha1').update(String(avain)).digest('hex')}.json`);

  // Palauttaa { arvo, tallennettu } tai null.
  async function hae(avain) {
    if (muisti.has(avain)) return muisti.get(avain);
    try {
      const merkinta = JSON.parse(await readFile(tiedosto(avain), 'utf8'));
      if (!merkinta || merkinta.avain !== avain || !Number.isFinite(merkinta.tallennettu)) return null;
      const tulos = { arvo: merkinta.arvo, tallennettu: merkinta.tallennettu };
      muisti.set(avain, tulos);
      return tulos;
    } catch {
      return null;
    }
  }

  async function aseta(avain, arvo, tallennettu = Date.now()) {
    const tulos = { arvo, tallennettu };
    muisti.delete(avain);
    muisti.set(avain, tulos);
    if (muisti.size > MAKS_MUISTISSA) muisti.delete(muisti.keys().next().value);
    try {
      await mkdir(hakemisto, { recursive: true });
      // Kirjoitus väliaikaiseen tiedostoon ja nimeäminen, jotta rinnakkainen luku ei näe puolikasta tiedostoa.
      const kohde = tiedosto(avain);
      const valiaikainen = `${kohde}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(valiaikainen, JSON.stringify({ avain, arvo, tallennettu }));
      await rename(valiaikainen, kohde);
    } catch {
      // Tiedostovälimuisti on vain lisä; muisti riittää.
    }
    return tulos;
  }

  async function tyhjenna() {
    muisti.clear();
    await rm(hakemisto, { recursive: true, force: true, maxRetries: 3 });
  }

  return { hae, aseta, tyhjenna };
}

// Yhdistää samanaikaiset samanlaiset haut yhdeksi.
export function luoYhdistaja() {
  const kesken = new Map();
  return function yhdista(avain, tehtava) {
    if (kesken.has(avain)) return kesken.get(avain);
    const lupaus = Promise.resolve().then(tehtava).finally(() => kesken.delete(avain));
    kesken.set(avain, lupaus);
    return lupaus;
  };
}
