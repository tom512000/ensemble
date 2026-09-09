import { useId } from 'react';
import { COLOR_META, type BottleColor } from '@ensemble/shared';
export function BottleArt({ color, shape = 0 }: { color: BottleColor; shape?: number }) {
  const id = useId().replace(/:/g, '');
  const meta = COLOR_META[color];
  const body =
    shape === 1
      ? 'M25 23 L25 13 Q25 10 28 10 H36 Q39 10 39 13 V23 Q39 28 45 35 Q49 39 49 46 V85 Q49 91 43 91 H21 Q15 91 15 85 V46 Q15 39 20 34 Q25 28 25 23Z'
      : shape === 2
        ? 'M25 24 V12 Q25 10 28 10 H36 Q39 10 39 12 V24 Q39 30 43 36 Q46 40 46 49 L49 83 Q50 91 43 91 H21 Q14 91 15 83 L18 49 Q18 40 22 34 Q25 29 25 24Z'
        : 'M25 23 V12 Q25 10 28 10 H36 Q39 10 39 12 V23 Q39 31 46 36 Q49 39 49 46 V84 Q49 91 42 91 H22 Q15 91 15 84 V46 Q15 39 18 36 Q25 31 25 23Z';
  return (
    <svg viewBox="0 0 64 100" aria-hidden="true" className="bottle-art">
      <defs>
        <linearGradient id={id + 'glass'} x1="0" x2="1">
          <stop stopColor="#b4cfc1" stopOpacity=".65" />
          <stop offset=".3" stopColor="#fff" stopOpacity=".85" />
          <stop offset=".55" stopColor="#e1eee4" stopOpacity=".35" />
          <stop offset="1" stopColor="#8eada0" stopOpacity=".65" />
        </linearGradient>
        <linearGradient id={id + 'label'} x1="0" x2="1">
          <stop stopColor={meta.hex} />
          <stop offset=".5" stopColor={meta.hex} stopOpacity=".82" />
          <stop offset="1" stopColor={meta.hex} />
        </linearGradient>
      </defs>
      <ellipse cx="33" cy="94" rx="19" ry="3" fill="#365442" opacity=".12" />
      <path d={body} fill={'url(#' + id + 'glass)'} stroke="#89a697" strokeWidth="1" />
      <path
        d="M21 44 V78 Q21 83 24 84"
        fill="none"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
        opacity=".85"
      />
      <rect x="24" y="6" width="16" height="10" rx="3" fill="#c8ba91" stroke="#ad9e76" />
      <path d="M27 8v5m5-5v5m5-5v5" stroke="#ebe1c3" opacity=".7" />
      <rect x="16" y="51" width="32" height="25" rx="3" fill={'url(#' + id + 'label)'} />
      <text x="32" y="69" textAnchor="middle" fill="#fffdf2" fontSize="18">
        {meta.symbol}
      </text>
      <path d="M22 88h20" stroke="#fff" strokeWidth="2" opacity=".6" />
    </svg>
  );
}
export function SortingIllustration({ mini = false }: { mini?: boolean }) {
  return (
    <div className={'sorting-illustration' + (mini ? ' mini' : '')} aria-hidden="true">
      <div className="illustration-note">
        <span>un peu d’ordre,</span>
        <span>beaucoup de bonheur.</span>
        <svg viewBox="0 0 70 40">
          <path
            d="M4 5 Q45 0 53 32 M43 23 L54 33 L61 21"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      </div>
      <div className="illustration-board">
        <div className="illustration-bins">
          {(['coral', 'honey', 'sage'] as const).map((color) => (
            <div
              key={color}
              style={{
                background: COLOR_META[color].hex + '33',
                borderColor: COLOR_META[color].hex + '70',
              }}
            >
              <span style={{ background: COLOR_META[color].hex }} />
              <BottleArt color={color} />
              <BottleArt color={color} shape={1} />
            </div>
          ))}
        </div>
        <div className="scattered-bottles">
          {(['sage', 'coral', 'honey', 'coral', 'sage', 'honey'] as const).map((color, i) => (
            <div key={i} className={'scattered b' + i}>
              <BottleArt color={color} shape={i % 3} />
            </div>
          ))}
        </div>
        <div className="illustration-cursor">
          <svg viewBox="0 0 24 24">
            <path d="m4 2 16 12-8 1-4 7Z" fill="#b8614d" stroke="white" strokeWidth="2" />
          </svg>
          <span>Camille</span>
        </div>
      </div>
      <span className="floating-star star-one">✳</span>
      <span className="floating-star star-two">✦</span>
    </div>
  );
}
