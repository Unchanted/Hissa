import { useEffect, useRef } from "react";

/**
 * Full-screen canvas: twinkling starfield plus a rotating particle planet whose
 * upper limb rises behind the hero. On app pages the planet sinks to a dim horizon.
 */
export function Cosmos({ variant }: { variant: "hero" | "app" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const variantRef = useRef(variant);
  variantRef.current = variant;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let raf = 0;

    const stars = Array.from({ length: 340 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() < 0.06 ? 1.7 : Math.random() * 1.1 + 0.35,
      p: Math.random() * Math.PI * 2,
      s: 0.4 + Math.random() * 1.6,
      d: Math.random(),
    }));

    // Fibonacci sphere with jitter and a mottled brightness field.
    const N = innerWidth < 700 ? 12000 : 34000;
    const P = new Float32Array(N * 6); // x y z base phase size
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y0 = 1 - (i / (N - 1)) * 2;
      const r0 = Math.sqrt(1 - y0 * y0);
      const th = golden * i;
      let x = Math.cos(th) * r0 + (Math.random() - 0.5) * 0.02;
      let y = y0 + (Math.random() - 0.5) * 0.02;
      let z = Math.sin(th) * r0 + (Math.random() - 0.5) * 0.02;
      const n = Math.hypot(x, y, z);
      x /= n;
      y /= n;
      z /= n;
      const mottle = 0.55 + 0.45 * Math.sin(x * 11 + z * 3) * Math.cos(z * 9 - y * 5) * Math.sin(y * 7 + x * 2);
      const base = (0.4 + Math.random() ** 2 * 0.9) * (0.5 + 0.5 * mottle);
      P.set([x, y, z, base, Math.random() * Math.PI * 2, Math.random() < 0.15 ? 2.2 : Math.random() < 0.5 ? 1.6 : 1.1], i * 6);
    }

    let top = variantRef.current === "hero" ? 0.62 : 0.95; // planet limb, fraction of height
    let mx = 0;
    let my = 0;
    let tmx = 0;
    let tmy = 0;

    const resize = () => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      w = innerWidth;
      h = innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const onMove = (e: PointerEvent) => {
      tmx = e.clientX / w - 0.5;
      tmy = e.clientY / h - 0.5;
    };

    const frame = (t: number) => {
      const hero = variantRef.current === "hero";
      const scroll = hero ? Math.min(scrollY / h, 1.2) : 0;
      const target = hero ? 0.5 + scroll * 0.55 : 0.9;
      top += (target - top) * (reduce ? 1 : 0.045);
      mx += (tmx - mx) * 0.04;
      my += (tmy - my) * 0.04;

      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";

      // Stars
      ctx.fillStyle = "#fff1dc";
      for (const s of stars) {
        const tw = Math.sin(t * 0.0009 * s.s + s.p);
        ctx.globalAlpha = (0.25 + 0.75 * tw * tw) * (0.25 + 0.75 * s.d);
        const sx = (s.x * w + mx * 18 * s.d + w) % w;
        const sy = (s.y * h + my * 12 * s.d - scroll * 60 * s.d + h) % h;
        ctx.fillRect(sx, sy, s.r, s.r);
      }

      // Planet
      const R = Math.max(w * 0.6, h * 0.78);
      const limbY = top * h;
      const cx = w / 2 + mx * 10;
      const cy = limbY + R;
      const power = hero ? 1 : 0.5;

      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 1;
      const glow = ctx.createRadialGradient(cx, limbY + R * 0.08, 0, cx, limbY + R * 0.08, R * 0.75);
      glow.addColorStop(0, `rgba(255,150,60,${0.2 * power})`);
      glow.addColorStop(0.35, `rgba(210,95,25,${0.08 * power})`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      const a = t * 0.000028;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const tilt = -0.32;
      const ct = Math.cos(tilt);
      const st = Math.sin(tilt);
      let lastStyle = "";
      for (let i = 0; i < N; i++) {
        const o = i * 6;
        const x = P[o]!;
        const y = P[o + 1]!;
        const z = P[o + 2]!;
        const x1 = x * ca - z * sa;
        const z1 = x * sa + z * ca;
        const y2 = y * ct - z1 * st;
        const z2 = y * st + z1 * ct;
        if (z2 < 0.02) continue;
        const sx = cx + x1 * R;
        const sy = cy + y2 * R;
        if (sy > h + 2 || sy < -2 || sx < -2 || sx > w + 2) continue;
        const dx = (sx - cx) / R;
        const dy = (sy - limbY) / R;
        const lit = Math.exp(-(dx * dx * 1.1 + dy * dy * 1.6));
        const rim = Math.pow(1 - z2, 4) * 1.1;
        const flick = 0.65 + 0.35 * Math.sin(t * 0.0021 + P[o + 4]!);
        const alpha = P[o + 3]! * (0.3 + 1.15 * lit + rim) * flick * power;
        if (alpha < 0.03) continue;
        const style = P[o + 4]! > 4.6 ? "#ffe2b8" : P[o + 4]! > 1.4 ? "#ff9f4a" : "#d9692a";
        if (style !== lastStyle) {
          ctx.fillStyle = style;
          lastStyle = style;
        }
        ctx.globalAlpha = Math.min(1, alpha);
        const sz = P[o + 5]!;
        ctx.fillRect(sx, sy, sz, sz);
      }

      // Light shaft through the centre of the disc
      ctx.globalAlpha = 1;
      const shaft = ctx.createRadialGradient(cx, limbY + R * 0.35, 0, cx, limbY + R * 0.35, R * 0.4);
      shaft.addColorStop(0, `rgba(255,170,90,${0.09 * power})`);
      shaft.addColorStop(1, "rgba(255,160,80,0)");
      ctx.save();
      ctx.translate(cx, limbY + R * 0.35);
      ctx.scale(0.22, 1);
      ctx.translate(-cx, -(limbY + R * 0.35));
      ctx.fillStyle = shaft;
      ctx.fillRect(0, limbY - R * 0.1, w * 3, h);
      ctx.restore();

      ctx.globalCompositeOperation = "source-over";
      if (!reduce) raf = requestAnimationFrame(frame);
    };

    resize();
    addEventListener("resize", resize);
    addEventListener("pointermove", onMove);
    const redraw = () => reduce && frame(performance.now());
    addEventListener("scroll", redraw, { passive: true });
    raf = requestAnimationFrame(frame);
    // Reduced motion: no animation loop, but still follow route and size changes.
    const slow = reduce ? setInterval(() => frame(performance.now()), 500) : 0;
    return () => {
      clearInterval(slow);
      cancelAnimationFrame(raf);
      removeEventListener("resize", resize);
      removeEventListener("pointermove", onMove);
      removeEventListener("scroll", redraw);
    };
  }, []);

  return <canvas ref={ref} className="cosmos" aria-hidden />;
}
