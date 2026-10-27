// Näytön lukitus taskussa tai kädessä kantamista varten: peittää kirjausnäkymän, ja auki pääsee vain
// liu'uttamalla nuppi oikeaan reunaan. Tulosnäkymä pysyy näkyvissä läpikuultavan peiton alla.
import { useRef, useState } from 'react';

const AUKI_OSUUS = 0.85;

export default function Lukitus({ onAvaa }) {
  const raideRef = useRef(null);
  const alkuRef = useRef(null);
  const [siirto, setSiirto] = useState(0);

  const maksimi = () => {
    const raide = raideRef.current;
    return raide ? raide.clientWidth - 64 : 0;
  };
  const alas = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    alkuRef.current = e.clientX - siirto;
  };
  const liiku = (e) => {
    if (alkuRef.current === null) return;
    setSiirto(Math.max(0, Math.min(maksimi(), e.clientX - alkuRef.current)));
  };
  const ylos = () => {
    if (alkuRef.current === null) return;
    alkuRef.current = null;
    if (maksimi() > 0 && siirto >= maksimi() * AUKI_OSUUS) {
      navigator.vibrate?.(30);
      onAvaa();
    }
    setSiirto(0);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-900/60 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] select-none touch-none">
      <div className="mb-4 text-center text-xl font-bold text-white drop-shadow">🔒 Lukittu</div>
      <div ref={raideRef} className="relative h-16 rounded-full bg-white/90">
        <span className="absolute inset-0 flex items-center justify-center pl-12 text-slate-600">Liu&apos;uta oikealle avataksesi →</span>
        <div
          aria-label="Avaa lukitus liu'uttamalla oikealle"
          className="absolute top-1 left-1 flex h-14 w-14 items-center justify-center rounded-full bg-blue-800 text-2xl text-white shadow"
          style={{ transform: `translateX(${siirto}px)` }}
          onPointerDown={alas}
          onPointerMove={liiku}
          onPointerUp={ylos}
          onPointerCancel={ylos}
        >
          🔓
        </div>
      </div>
    </div>
  );
}
