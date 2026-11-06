import { useMemo } from "react";

/**
 * Hissa mark: a particle pie with one 20% slice pulled out — the 80% that goes
 * to the user. Dots are seeded so the mark is identical on every render.
 */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COLORS = ["#ffe2b8", "#f0b06a", "#e08a3e", "#b8642a", "#9c8b78"];
const C = 50;
const R = 40;
// Pulled-out slice: 72° (20%) centred on the upper-left, as in the brand artwork.
const A0 = (-162 * Math.PI) / 180;
const A1 = (-90 * Math.PI) / 180;
const MID = (A0 + A1) / 2;

export function HissaMark({ size = 36, dots = 420, className = "" }: { size?: number; dots?: number; className?: string }) {
  const pts = useMemo(() => {
    const rnd = mulberry32(108);
    const out: { x: number; y: number; r: number; c: string; g: number }[] = [];
    const base = 34 / Math.sqrt(dots); // finer grain for denser marks
    let guard = 0;
    while (out.length < dots && guard++ < dots * 6) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * R;
      let ang = Math.atan2(Math.sin(a), Math.cos(a));
      if (ang > A0 && ang < A1) continue; // the slice is empty
      // Denser, brighter towards the rim, like the particle planet.
      if (rnd() > 0.35 + 0.65 * (d / R)) continue;
      ang = a;
      out.push({
        x: C + Math.cos(ang) * d,
        y: C + Math.sin(ang) * d,
        r: base * (0.45 + rnd() * 0.85),
        c: COLORS[Math.floor(rnd() * COLORS.length)]!,
        g: Math.floor(rnd() * 3),
      });
    }
    return out;
  }, [dots]);

  const sx = (a: number, r = R) => C + Math.cos(a) * r;
  const sy = (a: number, r = R) => C + Math.sin(a) * r;
  const slice = `M ${C} ${C} L ${sx(A0)} ${sy(A0)} A ${R} ${R} 0 0 1 ${sx(A1)} ${sy(A1)} Z`;
  const off = { x: Math.cos(MID) * 7, y: Math.sin(MID) * 7 };

  return (
    <svg className={`hissa-mark ${className}`} viewBox="0 0 100 100" width={size} height={size} aria-hidden>
      {[0, 1, 2].map((g) => (
        <g key={g} className={`hm-g hm-g${g}`}>
          {pts
            .filter((p) => p.g === g)
            .map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={p.c} />
            ))}
        </g>
      ))}
      <g className="hm-slice" style={{ ["--dx" as string]: `${off.x}px`, ["--dy" as string]: `${off.y}px` }}>
        <path d={slice} fill="rgba(235,165,96,0.06)" stroke="#ffe2b8" strokeWidth={1.1} strokeLinejoin="round" />
      </g>
    </svg>
  );
}
