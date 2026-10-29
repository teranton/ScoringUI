// Ampujan Compak-kortti: 5 asemaa × 5 kiekkoa, osumat / ammutut. Kirjauslaitteella (KirjausApp.jsx) kiekkoja ja
// keskeytystä voi napauttaa korjaustilassa; julkisessa ratanäkymässä (src/LiveRadat.jsx) kortti on vain luettava.
import { ASEMAN_KOHTEET, KOHTEITA, osumat, taytetyt } from './kortit.js';

export default function AmpujaRivi({ ampuja, merkit, lahetetty, kohta, korostus, valmis, keskeyttanyt, onKeskeyta, onValitse }) {
  const aktiivinen = kohta !== null;
  const asemat = Array.from({ length: KOHTEITA / ASEMAN_KOHTEET }, (_, a) => a);
  const reuna = korostus === 'korjaus' ? 'border-amber-600' : aktiivinen ? 'border-blue-700' : 'border-transparent';
  return (
    <div data-nro={ampuja.nro} className={`shrink-0 rounded-lg border-2 px-1.5 py-0.5 sm:p-2 ${valmis ? 'bg-slate-300' : 'bg-white'} ${reuna}`}>
      <div className="flex w-full items-center justify-between gap-2 text-left">
        <span className="min-w-0 truncate text-sm font-semibold sm:text-base">
          <span className="mr-2 inline-block min-w-8 rounded bg-slate-200 px-1 text-center">{ampuja.nro}</span>
          {ampuja.nimi || '(ei nimeä)'}
        </span>
        {/* Keskeytys vain korjaustilassa, ettei sitä paineta vahingossa kesken kirjauksen. */}
        {onKeskeyta ? (
          <button type="button" className={`shrink-0 rounded px-2 text-[11px] leading-5 sm:py-0.5 sm:text-xs ${keskeyttanyt ? 'bg-slate-700 text-white' : 'border border-slate-300 text-slate-600'}`} onClick={onKeskeyta}>
            {keskeyttanyt ? 'Keskeytti · peru' : 'Keskeytti'}
          </button>
        ) : keskeyttanyt && (
          <span className="shrink-0 rounded bg-slate-700 px-2 text-[11px] leading-5 text-white sm:text-xs">Keskeytti</span>
        )}
        <span className="shrink-0 text-lg leading-tight font-bold sm:text-xl">
          {osumat(merkit)}
          <span className="text-sm font-normal text-slate-500"> / {taytetyt(merkit)}{lahetetty ? '' : ' •'}</span>
        </span>
      </div>
      <div className="mt-1 grid grid-cols-5 gap-1.5 sm:mt-2 sm:gap-2">
        {asemat.map((a) => (
          <div key={a} className="grid grid-cols-5 gap-0.5">
            {Array.from({ length: ASEMAN_KOHTEET }, (_, k) => {
              const i = a * ASEMAN_KOHTEET + k;
              const m = merkit[i];
              const vari = m === 'X' ? 'bg-green-700 text-white' : m === 'O' ? 'bg-red-700 text-white' : 'bg-slate-100 text-slate-400';
              const luokat = `flex h-5 items-center justify-center rounded-sm text-xs font-bold sm:h-8 ${vari} ${kohta === i ? 'ring-2 ring-blue-700 ring-offset-1' : ''}`;
              const teksti = m === 'X' ? 'X' : m === 'O' ? '0' : '';
              // Kiekkoa voi napauttaa vain korjaustilassa ja vain, jos se on jo merkitty.
              return onValitse && m !== '-' ? (
                <button key={i} type="button" aria-label={`Korjaa asema ${a + 1}, kiekko ${k + 1}`} className={`${luokat} ring-1 ring-amber-500`} onClick={() => onValitse(i)}>
                  {teksti}
                </button>
              ) : (
                <div key={i} className={luokat}>{teksti}</div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
