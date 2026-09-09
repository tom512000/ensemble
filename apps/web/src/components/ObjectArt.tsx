import { COLOR_META, COLORS, MAX_SHAPES, type BottleColor } from '@ensemble/shared';

interface Silhouette {
  body: string;
  /** Lid, cap or fold drawn above the body. */
  top: string;
  /** The coloured band that says where the object belongs. */
  label: { x: number; y: number; width: number; height: number };
  shine: string;
}

// Six everyday containers in one flat glass style, all inside the same 64x100 box so any
// of them can stand in for another without the board shifting.
const SILHOUETTES: Silhouette[] = [
  {
    body: 'M25 23 V12 Q25 10 28 10 H36 Q39 10 39 12 V23 Q39 31 46 36 Q49 39 49 46 V84 Q49 91 42 91 H22 Q15 91 15 84 V46 Q15 39 18 36 Q25 31 25 23Z',
    top: 'M24 6 h16 v10 h-16 z',
    label: { x: 16, y: 51, width: 32, height: 25 },
    shine: 'M21 46 V78 Q21 83 24 84',
  },
  {
    body: 'M14 31 Q14 27 18 27 H46 Q50 27 50 31 V85 Q50 91 44 91 H20 Q14 91 14 85 Z',
    top: 'M16 18 h32 v9 h-32 z',
    label: { x: 18, y: 48, width: 28, height: 26 },
    shine: 'M20 40 V80 Q20 85 23 86',
  },
  {
    body: 'M18 25 Q18 21 22 21 H42 Q46 21 46 25 V86 Q46 91 41 91 H23 Q18 91 18 86 Z',
    top: 'M20 17 h24 v6 h-24 z',
    label: { x: 19, y: 45, width: 26, height: 29 },
    shine: 'M23 36 V80 Q23 85 26 86',
  },
  {
    body: 'M27 31 V19 Q27 17 30 17 H34 Q37 17 37 19 V31 Q46 35 48 49 Q50 63 47 76 Q44 89 32 89 Q20 89 17 76 Q14 63 16 49 Q18 35 27 31Z',
    top: 'M26 10 h12 v8 h-12 z',
    label: { x: 18, y: 53, width: 28, height: 22 },
    shine: 'M23 52 V74 Q24 80 27 82',
  },
  {
    body: 'M16 27 H48 V86 Q48 91 43 91 H21 Q16 91 16 86 Z',
    top: 'M16 27 L32 15 L48 27 Z',
    label: { x: 19, y: 47, width: 26, height: 27 },
    shine: 'M21 38 V80 Q21 85 24 86',
  },
  {
    body: 'M22 27 H42 V83 Q42 91 35 91 H29 Q22 91 22 83 Z',
    top: 'M26 13 h12 q3 0 3 3 v10 h-18 v-10 q0-3 3-3 z',
    label: { x: 23, y: 45, width: 18, height: 29 },
    shine: 'M26 38 V78 Q26 83 28 84',
  },
];

/**
 * Every object shares these gradients. Defining them per object meant hundreds of
 * duplicate definitions on a busy board, which was the single biggest cost in a frame.
 * Rendered once for the whole app, near the root.
 */
export function ObjectDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute' }}>
      <defs>
        <linearGradient id="ens-glass" x1="0" x2="1">
          <stop stopColor="#b4cfc1" stopOpacity=".65" />
          <stop offset=".3" stopColor="#fff" stopOpacity=".85" />
          <stop offset=".55" stopColor="#e1eee4" stopOpacity=".35" />
          <stop offset="1" stopColor="#8eada0" stopOpacity=".65" />
        </linearGradient>
        {COLORS.map((color) => (
          <linearGradient key={color} id={'ens-label-' + color} x1="0" x2="1">
            <stop stopColor={COLOR_META[color].hex} />
            <stop offset=".5" stopColor={COLOR_META[color].hex} stopOpacity=".82" />
            <stop offset="1" stopColor={COLOR_META[color].hex} />
          </linearGradient>
        ))}
      </defs>
    </svg>
  );
}

export function ObjectArt({ color, shape = 0 }: { color: BottleColor; shape?: number }) {
  const meta = COLOR_META[color];
  const art = SILHOUETTES[((shape % MAX_SHAPES) + MAX_SHAPES) % MAX_SHAPES]!;
  const { label } = art;
  return (
    <svg viewBox="0 0 64 100" aria-hidden="true" className="bottle-art">
      <ellipse cx="33" cy="94" rx="19" ry="3" fill="#365442" opacity=".12" />
      <path d={art.body} fill="url(#ens-glass)" stroke="#89a697" strokeWidth="1" />
      <path
        d={art.shine}
        fill="none"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
        opacity=".85"
      />
      <path d={art.top} fill="#c8ba91" stroke="#ad9e76" strokeWidth="1" strokeLinejoin="round" />
      <rect
        x={label.x}
        y={label.y}
        width={label.width}
        height={label.height}
        rx="3"
        fill={'url(#ens-label-' + color + ')'}
      />
      <text
        x={label.x + label.width / 2}
        y={label.y + label.height / 2 + 6}
        textAnchor="middle"
        fill="#fffdf2"
        fontSize={Math.min(18, label.width * 0.62)}
      >
        {meta.symbol}
      </text>
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
          {(['coral', 'honey', 'sage'] as const).map((color, i) => (
            <div
              key={color}
              style={{
                background: COLOR_META[color].hex + '33',
                borderColor: COLOR_META[color].hex + '70',
              }}
            >
              <span style={{ background: COLOR_META[color].hex }} />
              <ObjectArt color={color} shape={i} />
              <ObjectArt color={color} shape={i + 3} />
            </div>
          ))}
        </div>
        <div className="scattered-bottles">
          {(['sage', 'coral', 'honey', 'coral', 'sage', 'honey'] as const).map((color, i) => (
            <div key={i} className={'scattered b' + i}>
              <ObjectArt color={color} shape={i} />
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
