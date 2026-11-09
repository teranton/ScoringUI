// Kisan Info-sivu: pikapainikkeet (ilmoittautuneet, aikataulu, ilmoittautuminen, kilpailukutsu), perustiedot,
// ilmoittautumisen tilanne, kuvaus, asiakirjat (OHJE:-rivit) ja yhteystiedot. Tiedot: utils/kisaInfo.js.
import { CalendarDays, ClipboardList, ExternalLink, FileText, MapPin, PenLine, Trophy } from 'lucide-react';
import MateriaaliNakyma from './MateriaaliNakyma';
import { Button } from './components/ui/button';
import { Card, CardContent } from './components/ui/card';
import { haeTekstit } from './i18n';
import { muotoileTakaraja } from './utils/ilmoittautumiset';

const korvaa = (teksti, arvot) => Object.entries(arvot).reduce((t, [k, v]) => t.replaceAll(`{${k}}`, String(v)), teksti);

function Pikapainike({ ensisijainen, href, onClick, ikoni: Ikoni, children }) {
  const luokka = 'h-10 flex-1 basis-[calc(50%-0.25rem)] gap-1.5';
  const variantti = ensisijainen ? 'default' : 'outline';
  if (href) {
    return (
      <Button asChild variant={variantti} className={luokka}>
        <a href={href} target="_blank" rel="noopener noreferrer">
          <Ikoni className="h-4 w-4" aria-hidden="true" />
          {children}
          <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
        </a>
      </Button>
    );
  }
  return (
    <Button type="button" variant={variantti} className={luokka} onClick={onClick}>
      <Ikoni className="h-4 w-4" aria-hidden="true" />
      {children}
    </Button>
  );
}

function Lohko({ otsikko, children }) {
  return (
    <Card>
      <CardContent className="space-y-1.5 p-4 text-sm">
        {otsikko && <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">{otsikko}</h2>}
        {children}
      </CardContent>
    </Card>
  );
}

const linkkiLuokka = 'underline underline-offset-2 hover:text-[hsl(var(--foreground))]';

export default function KisaInfo({
  info,
  kisaPaivat,
  onkoTulossa,
  lomake,
  tilanne,
  onkoIlmoittautuneita,
  onkoAikatauluSallittu,
  onkoTuloksetSallittu,
  valitseSivu,
  locale = 'fi'
}) {
  const tx = haeTekstit('kisaInfo', locale);

  const painikkeet = [];
  if (onkoTulossa) {
    if (onkoIlmoittautuneita) {
      const maara = tilanne?.osallistujia > 0 ? ` ${tilanne.osallistujia}` : '';
      painikkeet.push({ avain: 'ilmo', ikoni: ClipboardList, teksti: `${tx.registrations}${maara}`, onClick: () => valitseSivu('ilmoittautuneet') });
    }
  } else if (onkoTuloksetSallittu) {
    painikkeet.push({ avain: 'tulokset', ikoni: Trophy, teksti: tx.results, onClick: () => valitseSivu('tulokset') });
  }
  if (onkoAikatauluSallittu) {
    painikkeet.push({ avain: 'aikataulu', ikoni: CalendarDays, teksti: tx.timetable, onClick: () => valitseSivu('aikataulu') });
  }
  if (onkoTulossa && lomake?.auki) {
    painikkeet.push({ avain: 'ilmoittaudu', ikoni: PenLine, teksti: tx.signUp, onClick: () => valitseSivu('ilmoittautuneet') });
  } else if (onkoTulossa && info.ilmoittautumisLinkki) {
    painikkeet.push({ avain: 'ilmoittaudu', ikoni: PenLine, teksti: tx.signUp, href: info.ilmoittautumisLinkki });
  }
  if (info.kutsu) {
    painikkeet.push({ avain: 'kutsu', ikoni: FileText, teksti: tx.invitation, href: info.kutsu.url });
  }

  const aika = [kisaPaivat, info.aloitusAika && `${tx.firstStart} ${info.aloitusAika}`].filter(Boolean).join(', ');
  const laji = [info.laji, info.kiekkoja > 0 && `${info.kiekkoja} ${tx.targets}`].filter(Boolean).join(', ');
  const tiedot = [
    aika && { otsikko: tx.date, arvo: aika },
    laji && { otsikko: tx.discipline, arvo: laji },
    info.paikka && {
      otsikko: tx.place,
      arvo: (
        <>
          {info.paikka}{' '}
          {info.karttaUrl && (
            <a href={info.karttaUrl} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-0.5 ${linkkiLuokka}`}>
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />{tx.map}
            </a>
          )}
        </>
      )
    },
    info.jarjestaja && { otsikko: tx.organiser, arvo: info.jarjestaja },
    info.osallistumismaksu && { otsikko: tx.fee, arvo: info.osallistumismaksu },
    info.sarjat.length > 0 && { otsikko: tx.classes, arvo: info.sarjat.join(', ') }
  ].filter(Boolean);

  const ilmoRivit = [];
  if (onkoTulossa) {
    if (lomake?.kaytossa) {
      ilmoRivit.push(lomake.auki ? korvaa(tx.signUpFormUntil, { aika: muotoileTakaraja(lomake.takaraja, locale) }) : tx.signUpClosed);
    } else if (info.ilmoittautumisLinkki) {
      ilmoRivit.push(
        <a key="linkki" href={info.ilmoittautumisLinkki} target="_blank" rel="noopener noreferrer" className={linkkiLuokka}>
          {info.ilmoittautuminenSuomisportissa ? tx.signUpLink : tx.signUpLinkOther}
        </a>
      );
    }
    const osallistujia = tilanne?.osallistujia || 0;
    if (lomake?.maksimi) {
      ilmoRivit.push(`${korvaa(tx.placesTaken, { n: Math.min(osallistujia, lomake.maksimi), max: lomake.maksimi })}.`);
      if (lomake.varasijat) ilmoRivit.push(korvaa(tx.waitingPlaces, { n: lomake.varasijat }));
      if (tilanne?.varalla) ilmoRivit.push(korvaa(tx.waitingNow, { n: tilanne.varalla }));
    } else if (osallistujia > 0) {
      ilmoRivit.push(korvaa(tx.signedUp, { n: osallistujia }));
    }
  }

  const yhteystieto = info.yhteystieto;
  const onkoMuutaTietoa = tiedot.length > 1 || ilmoRivit.length > 0 || info.kuvaus || info.asiakirjat.length > 0 || yhteystieto.length > 0;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3">
      {painikkeet.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {painikkeet.map(({ avain, teksti, ...p }, i) => (
            <Pikapainike key={avain} ensisijainen={i === 0} {...p}>{teksti}</Pikapainike>
          ))}
        </div>
      )}

      {tiedot.length > 0 && (
        <Lohko>
          <dl className="grid grid-cols-[minmax(6.5rem,auto)_1fr] gap-x-3 gap-y-1.5">
            {tiedot.map(({ otsikko, arvo }) => (
              <div key={otsikko} className="contents">
                <dt className="text-[hsl(var(--muted-foreground))]">{otsikko}</dt>
                <dd className="m-0 text-[hsl(var(--foreground))]">{arvo}</dd>
              </div>
            ))}
          </dl>
        </Lohko>
      )}

      {ilmoRivit.length > 0 && (
        <Lohko otsikko={tx.signUpTitle}>
          <p className="text-[hsl(var(--foreground))]">
            {ilmoRivit.map((rivi, i) => <span key={i}>{i > 0 && ' '}{rivi}</span>)}
          </p>
        </Lohko>
      )}

      {info.kuvaus && (
        <Lohko otsikko={tx.description}>
          <p className="whitespace-pre-line text-[hsl(var(--foreground))]">{info.kuvaus}</p>
        </Lohko>
      )}

      {info.asiakirjat.length > 0 && <MateriaaliNakyma guides={info.asiakirjat} locale={locale} />}

      {yhteystieto.length > 0 && (
        <Lohko otsikko={tx.contact}>
          <p className="text-[hsl(var(--foreground))]">
            {yhteystieto.map((osa, i) => (osa.href
              ? <a key={i} href={osa.href} className={linkkiLuokka}>{osa.teksti}</a>
              : <span key={i}>{osa.teksti}</span>))}
          </p>
        </Lohko>
      )}

      {!onkoMuutaTietoa && (
        <p className="px-1 text-sm text-[hsl(var(--muted-foreground))]">{tx.noInfo}</p>
      )}
    </div>
  );
}
