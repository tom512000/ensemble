import { TRAIT_CHOICES, type HeadLook } from '@ensemble/shared';

const SKINS = ['#f0cfae', '#e0ac82', '#c98a5f', '#8d5a3b'];
const HAIR_HUES = ['#3d3129', '#8a5a2b', '#c8873f', '#6d6f76', '#a4485f'];

/** Chevelures : un tracé par style, dessiné par-dessus le crâne. */
const HAIR: string[] = [
  'M18 44 Q18 16 50 16 Q82 16 82 44 Q82 30 66 27 Q54 34 34 27 Q18 31 18 44Z',
  'M16 46 Q16 14 50 14 Q84 14 84 46 L84 30 Q50 6 16 30Z',
  'M20 40 Q22 18 50 18 Q78 18 80 40 Q70 24 50 24 Q30 24 20 40Z M16 40 Q12 62 18 74 L24 44Z M84 40 Q88 62 82 74 L76 44Z',
  'M22 42 Q26 16 50 16 Q74 16 78 42 Q72 26 60 30 Q50 20 40 30 Q28 26 22 42Z M46 12 Q50 4 56 12Z',
  'M18 48 Q14 18 50 18 Q86 18 82 48 Q80 28 50 28 Q20 28 18 48Z M14 48 Q10 76 20 88 L26 52Z',
  'M24 38 Q30 20 50 20 Q70 20 76 38 Q64 30 50 32 Q36 30 24 38Z',
];

const EYES: string[] = [
  'M36 52 a4 4 0 1 0 .1 0Z M64 52 a4 4 0 1 0 .1 0Z',
  'M31 52 h10 M59 52 h10',
  'M36 50 a4.5 5.5 0 1 0 .1 0Z M64 50 a4.5 5.5 0 1 0 .1 0Z',
  'M31 54 q5 -7 10 0 M59 54 q5 -7 10 0',
  'M32 49 q4 -4 9 0 M36 53 a3 3 0 1 0 .1 0Z M59 49 q4 -4 9 0 M64 53 a3 3 0 1 0 .1 0Z',
];

const MOUTHS: string[] = [
  'M40 70 q10 8 20 0',
  'M42 71 h16',
  'M40 68 q10 12 20 0 Z',
  'M42 73 q8 -8 16 0',
  'M44 69 a5 4 0 1 0 12 0Z',
];

/** Accessoires : rien, lunettes, chapeau, moustache. */
function extraOf(index: number, hue: string) {
  if (index === 1)
    return (
      <g stroke="#40453c" strokeWidth="2.4" fill="none">
        <circle cx="37" cy="52" r="9" />
        <circle cx="63" cy="52" r="9" />
        <path d="M46 52 h8" />
      </g>
    );
  if (index === 2)
    return (
      <g>
        <path d="M14 34 H86 L78 30 Q50 6 22 30Z" fill={hue} stroke="#00000022" />
        <path d="M14 34 H86" stroke="#00000033" strokeWidth="3" />
      </g>
    );
  if (index === 3) return <path d="M38 64 q12 -6 24 0 q-12 5 -24 0Z" fill="#00000055" />;
  return null;
}

export function HeadArt({ look }: { look: HeadLook }) {
  const skin = SKINS[look.skin % TRAIT_CHOICES.skin]!;
  const hue = HAIR_HUES[look.hue % TRAIT_CHOICES.hue]!;
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="head-art">
      <ellipse cx="50" cy="95" rx="24" ry="3.5" fill="#3a4a35" opacity=".13" />
      <path d="M50 88 q-16 0 -16 -10 h32 q0 10 -16 10Z" fill={skin} opacity=".9" />
      <ellipse cx="50" cy="54" rx="32" ry="34" fill={skin} stroke="#00000018" />
      <ellipse cx="20" cy="58" rx="5" ry="7" fill={skin} stroke="#00000014" />
      <ellipse cx="80" cy="58" rx="5" ry="7" fill={skin} stroke="#00000014" />
      <path d={HAIR[look.hair % TRAIT_CHOICES.hair]!} fill={hue} stroke="#00000018" />
      <g
        stroke="#3a3128"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill={look.eyes === 0 || look.eyes === 2 ? '#3a3128' : 'none'}
      >
        <path d={EYES[look.eyes % TRAIT_CHOICES.eyes]!} />
      </g>
      <path
        d={MOUTHS[look.mouth % TRAIT_CHOICES.mouth]!}
        stroke="#93483f"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill={look.mouth === 2 || look.mouth === 4 ? '#93483f' : 'none'}
      />
      {extraOf(look.extra % TRAIT_CHOICES.extra, hue)}
    </svg>
  );
}

/** Aperçu pour la collection : une petite foule où une tête détonne. */
export function CrowdIllustration() {
  const twin: HeadLook = { skin: 1, hair: 1, eyes: 0, mouth: 0, extra: 0, hue: 1 };
  const lone: HeadLook = { skin: 0, hair: 4, eyes: 3, mouth: 3, extra: 1, hue: 4 };
  const crowd: HeadLook[] = [twin, twin, lone, twin, twin, twin];
  return (
    <div className="crowd-illustration" aria-hidden="true">
      <div className="crowd-illustration-grid">
        {crowd.map((look, i) => (
          <span key={i} className={look === lone ? 'crowd-lone' : undefined}>
            <HeadArt look={look} />
          </span>
        ))}
      </div>
      <span className="floating-star star-one">✳</span>
    </div>
  );
}
