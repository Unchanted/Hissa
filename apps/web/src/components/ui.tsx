import { useEffect, useRef, useState, type ReactNode } from "react";
import { short } from "../lib";

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  href,
  size,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  href?: string;
  size?: "sm" | "lg";
}) {
  const cls = `btn btn-${variant}${size ? ` btn-${size}` : ""}`;
  if (href)
    return (
      <a className={cls} href={href}>
        <span>{children}</span>
      </a>
    );
  return (
    <button className={cls} onClick={onClick} disabled={disabled}>
      <span>{children}</span>
    </button>
  );
}

export function Toggle({
  on,
  onChange,
  label,
  hint,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`toggle${on ? " on" : ""}${disabled ? " disabled" : ""}`}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        className="toggle-track"
        onClick={() => onChange(!on)}
      >
        <span className="toggle-thumb" />
      </button>
      <span className="toggle-text">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

export function Panel({ children, label, className = "", aside }: { children: ReactNode; label?: string; className?: string; aside?: ReactNode }) {
  return (
    <section className={`panel ${className}`}>
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
      {label && (
        <header className="panel-head">
          <span className="eyebrow">{label}</span>
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

/** A hash or ID shown short, full value on hover, click to copy. Marked as simulated. */
export function Hash({ value, head = 8, tail = 6, label, href, note }: { value: string; head?: number; tail?: number; label?: string; href?: string; note?: string }) {
  const [copied, setCopied] = useState(false);
  if (href)
    return (
      <a className="hash live" href={href} target="_blank" rel="noreferrer" title={`${value}\nOpen on HashScan`}>
        {label && <span className="hash-label">{label}</span>}
        <span>{short(value, head, tail)}</span>
        <span className="hash-ext">↗</span>
      </a>
    );
  return (
    <button
      type="button"
      className="hash"
      title={`${value}\n${note ?? "(simulated in this preview — click to copy)"}`}
      onClick={() => {
        navigator.clipboard?.writeText(value).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 900);
      }}
    >
      {label && <span className="hash-label">{label}</span>}
      <span>{copied ? "copied" : short(value, head, tail)}</span>
    </button>
  );
}

const GLYPHS = "▓▒░<>/\\#%01ABCDEF§¤";
/** Scrambles the original text and resolves to the placeholder. */
export function Scramble({ from, to, go, delay = 0 }: { from: string; to: string; go: boolean; delay?: number }) {
  const [text, setText] = useState(from);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!go) {
      setText(from);
      setDone(false);
      return;
    }
    let raf = 0;
    let start = 0;
    const dur = 650;
    const tick = (t: number) => {
      if (!start) start = t + delay;
      const k = (t - start) / dur;
      if (k < 0) {
        raf = requestAnimationFrame(tick);
        return;
      }
      if (k >= 1) {
        setText(to);
        setDone(true);
        return;
      }
      const len = Math.round(from.length + (to.length - from.length) * k);
      const keep = Math.floor(to.length * Math.max(0, k * 1.4 - 0.4));
      let s = to.slice(0, keep);
      for (let i = keep; i < len; i++) s += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      setText(s);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [go, from, to, delay]);
  return <span className={`pii${go ? " masking" : ""}${done ? " masked" : ""}`}>{text}</span>;
}

export type LogLine = { id: number; text: ReactNode; kind?: "cmd" | "ok" | "warn" | "err" | "dim" | "pay" | "og" | "arkiv" };

export function Console({ lines, title, busy, height = 360 }: { lines: LogLine[]; title: string; busy?: boolean; height?: number }) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    body.current?.scrollTo({ top: body.current.scrollHeight, behavior: "smooth" });
  }, [lines.length]);
  return (
    <div className="console">
      <div className="console-bar">
        <span className="dots">
          <i />
          <i />
          <i />
        </span>
        <span className="console-title">{title}</span>
        <span className={`console-state${busy ? " busy" : ""}`}>{busy ? "RUNNING" : lines.length ? "IDLE" : "READY"}</span>
      </div>
      <div className="console-body" ref={body} style={{ height }}>
        {lines.map((l) => (
          <div key={l.id} className={`log log-${l.kind ?? "dim"}`}>
            {l.text}
          </div>
        ))}
        <div className="log caret">{busy ? "" : "▍"}</div>
      </div>
    </div>
  );
}

/** Append-only log with a cancel-safe async runner. */
export function useLog() {
  const [lines, setLines] = useState<LogLine[]>([]);
  const n = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const push = (text: ReactNode, kind?: LogLine["kind"]) => {
    if (!alive.current) return;
    n.current += 1;
    const id = n.current;
    setLines((ls) => [...ls, { id, text, kind }]);
  };
  const clear = () => setLines([]);
  return { lines, push, clear, alive };
}

export function CountUp({ value, decimals = 2, dur = 900 }: { value: number; decimals?: number; dur?: number }) {
  const [v, setV] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const a = from.current;
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const k = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      setV(a + (value - a) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, dur]);
  return <>{v.toFixed(decimals)}</>;
}

export function Chip({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "gold" | "ok" | "warn" | "err" }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

export function SponsorTag({ who }: { who: "0G" | "ARKIV" | "HEDERA" }) {
  return <span className={`sponsor sponsor-${who.toLowerCase()}`}>{who}</span>;
}

/** Runs an async effect once per mount, even under StrictMode's double effect pass. */
export function useOnce(fn: () => void) {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    fn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function PageHead({ eyebrow, title, sub, aside }: { eyebrow: string; title: ReactNode; sub?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {aside}
    </div>
  );
}
