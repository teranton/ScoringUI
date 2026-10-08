import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EstettyHakuError, onEstettyIp, turvallinenHaku } from './safeFetch.js';

test('onEstettyIp estää yksityiset ja paikalliset osoitteet', () => {
  for (const ip of [
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1',
    '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:169.254.169.254',
    '64:ff9b::a9fe:a9fe', '64:ff9b:1::808:808', '2002:a9fe:a9fe::', '2001:0:4136:e378::1', 'ff02::1', 'ei-ip'
  ]) {
    assert.equal(onEstettyIp(ip), true, ip);
  }
});

test('onEstettyIp päästää julkiset osoitteet', () => {
  for (const ip of ['8.8.8.8', '142.250.74.1', '2a00:1450:4001:80b::200e', '::ffff:8.8.8.8', '2002:808:808::']) {
    assert.equal(onEstettyIp(ip), false, ip);
  }
});

test('turvallinenHaku torjuu IP-literaalin ja nimen, joka osoittaa sisäverkkoon', async () => {
  const sallikaikki = () => true;
  await assert.rejects(turvallinenHaku('http://127.0.0.1/', { hostSallittu: sallikaikki, maxBytes: 100 }), EstettyHakuError);
  await assert.rejects(turvallinenHaku('http://[::1]/', { hostSallittu: sallikaikki, maxBytes: 100 }), EstettyHakuError);
  await assert.rejects(turvallinenHaku('http://localhost/', { hostSallittu: sallikaikki, maxBytes: 100 }), EstettyHakuError);
  await assert.rejects(turvallinenHaku('file:///etc/passwd', { hostSallittu: sallikaikki, maxBytes: 100 }), EstettyHakuError);
});

async function kaynnistaPalvelin(kasittelija) {
  const palvelin = http.createServer(kasittelija);
  await new Promise((r) => palvelin.listen(0, '127.0.0.1', r));
  return { palvelin, port: palvelin.address().port };
}

// Testipalvelin on 127.0.0.1:ssä, joten testeissä vain 169.254.0.0/16 katsotaan estetyksi.
const estaVainMetadata = (ip) => ip.startsWith('169.254.');

test('turvallinenHaku torjuu uudelleenohjauksen sisäverkkoon', async () => {
  const { palvelin, port } = await kaynnistaPalvelin((req, res) => {
    res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' });
    res.end();
  });
  try {
    await assert.rejects(
      turvallinenHaku(`http://127.0.0.1:${port}/logo.png`, { hostSallittu: () => true, maxBytes: 100, onEstetty: estaVainMetadata }),
      EstettyHakuError
    );
  } finally {
    palvelin.close();
  }
});

test('turvallinenHaku torjuu uudelleenohjauksen kiellettyyn hostiin', async () => {
  const { palvelin, port } = await kaynnistaPalvelin((req, res) => {
    res.writeHead(301, { Location: 'http://pahis.example/' });
    res.end();
  });
  try {
    await assert.rejects(
      turvallinenHaku(`http://127.0.0.1:${port}/`, {
        hostSallittu: (h) => h === '127.0.0.1',
        maxBytes: 100,
        onEstetty: estaVainMetadata
      }),
      EstettyHakuError
    );
  } finally {
    palvelin.close();
  }
});

test('turvallinenHaku seuraa sallitun uudelleenohjauksen ja rajaa koon', async () => {
  const { palvelin, port } = await kaynnistaPalvelin((req, res) => {
    if (req.url === '/vanha') {
      res.writeHead(302, { Location: '/uusi' });
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(req.url === '/iso' ? Buffer.alloc(500) : Buffer.from('PNG'));
  });
  const asetukset = { hostSallittu: () => true, maxBytes: 100, onEstetty: estaVainMetadata };
  try {
    const ok = await turvallinenHaku(`http://127.0.0.1:${port}/vanha`, asetukset);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.toString(), 'PNG');
    assert.equal(ok.headers['content-type'], 'image/png');

    const iso = await turvallinenHaku(`http://127.0.0.1:${port}/iso`, asetukset);
    assert.equal(iso.liianSuuri, true);
  } finally {
    palvelin.close();
  }
});

test('turvallinenHaku katkaisee hitaasti tippuvan vastauksen kokonaisajan jälkeen', async () => {
  const { palvelin, port } = await kaynnistaPalvelin((req, res) => {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    const ajastin = setInterval(() => res.write('x'), 20);
    res.on('close', () => clearInterval(ajastin));
  });
  try {
    const alku = Date.now();
    await assert.rejects(
      turvallinenHaku(`http://127.0.0.1:${port}/`, { hostSallittu: () => true, maxBytes: 1000, onEstetty: estaVainMetadata, timeoutMs: 200 }),
      /Aikakatkaisu|aborted/
    );
    assert.ok(Date.now() - alku < 2000);
  } finally {
    palvelin.closeAllConnections();
    palvelin.close();
  }
});
