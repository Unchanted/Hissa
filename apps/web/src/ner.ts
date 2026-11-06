/**
 * On-device masking. Nothing here leaves the browser.
 *
 *   1. Rules: emails, phone numbers and order/account IDs.
 *   2. Model: Xenova/bert-base-NER (int8, ~109 MB, cached by the browser after the first
 *      download) runs in a Web Worker (ner.worker.ts) and finds people (PER) and places (LOC).
 *      Organisations and MISC are kept on purpose: brands are what buyers pay for.
 *
 * If the model cannot load, masking falls back to the rules alone and the seller must review
 * the text before continuing. 0G never masks anything: it only classifies masked text.
 */
import { useSyncExternalStore } from "react";

export type MaskKind = "PERSON" | "PLACE" | "EMAIL" | "PHONE" | "ID";
export type MaskSpan = { orig: string; ph: string; kind: MaskKind };
export type MaskResult = { masked: string; spans: MaskSpan[]; mode: "model" | "rules"; warning?: string };
/** One raw token from the token-classification pipeline (aggregation "none"). */
export type NerToken = { entity: string; score: number; index: number; word: string; start?: number; end?: number };

export const NER_MODEL = "Xenova/bert-base-NER";
const MIN_SCORE = 0.6;
const ENTITY_KIND: Record<string, MaskKind | undefined> = { PER: "PERSON", LOC: "PLACE" };

/** Existing placeholders, numbered like [EMAIL_1] or coarse tags like [AGE 18–24]; never re-masked. */
const PLACEHOLDER = /\[[A-Z][A-Z_]*(?:_\d+| [^[\]\n]{1,30})\]/g;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const RULES: { kind: MaskKind; re: RegExp }[] = [
  { kind: "EMAIL", re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { kind: "ID", re: /\b[A-Z]{2,5}-?\d{6,}\b/g },
  { kind: "PHONE", re: /\+?\d[\d().\s-]{7,}\d/g },
];

/* ------------------------------ pure logic (unit-tested) ------------------------------ */

/** Splits text into pieces under `max` characters, at line and then sentence boundaries. */
export function chunkText(text: string, max = 300): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    if (line.length <= max) {
      out.push(line);
      continue;
    }
    let cur = "";
    for (const sentence of line.split(/(?<=[.!?])\s+/)) {
      for (let s = sentence; s.length; s = s.slice(max)) {
        const piece = s.slice(0, max);
        if (cur && cur.length + 1 + piece.length > max) {
          out.push(cur);
          cur = piece;
        } else cur = cur ? `${cur} ${piece}` : piece;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

/**
 * Groups raw word-piece tokens into entity strings found in `chunk`. A "##" piece always joins
 * the previous token; otherwise consecutive tokens of the same type join unless a B- tag starts
 * a new entity. Returns the exact original text of each entity.
 */
export function entitiesIn(chunk: string, tokens: NerToken[], minScore = MIN_SCORE): { orig: string; kind: MaskKind }[] {
  type Group = { kind: MaskKind; toks: NerToken[] };
  const groups: Group[] = [];
  let cur: Group | null = null;
  for (const t of [...tokens].sort((a, b) => a.index - b.index)) {
    const [tag, type = ""] = t.entity.split("-") as [string, string?];
    const kind = ENTITY_KIND[type];
    const last = cur?.toks[cur.toks.length - 1];
    const adjacent = !!last && t.index === last.index + 1;
    if (cur && adjacent && (t.word.startsWith("##") || (kind === cur.kind && tag !== "B"))) {
      cur.toks.push(t);
      continue;
    }
    cur = kind ? { kind, toks: [t] } : null;
    if (cur) groups.push(cur);
  }
  const out: { orig: string; kind: MaskKind }[] = [];
  for (const g of groups) {
    if (g.toks.reduce((a, t) => a + t.score, 0) / g.toks.length < minScore) continue;
    const first = g.toks[0]!;
    const last = g.toks[g.toks.length - 1]!;
    let orig = "";
    if (first.start != null && last.end != null && last.end > first.start) orig = chunk.slice(first.start, last.end);
    else {
      // No offsets: rebuild from the pieces, allowing any spacing between whole words.
      let src = "";
      g.toks.forEach((t, i) => {
        const piece = t.word.startsWith("##") ? t.word.slice(2) : t.word;
        src += (i && !t.word.startsWith("##") ? "\\s*" : "") + escapeRe(piece);
      });
      orig = new RegExp(`(?<![\\p{L}\\p{N}])${src}(?![\\p{L}\\p{N}])`, "u").exec(chunk)?.[0] ?? "";
    }
    orig = orig.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.]+$/gu, "");
    if (orig.length >= 2 && !/^\[.*\]$/.test(orig)) out.push({ orig, kind: g.kind });
  }
  return out;
}

/**
 * Replaces every occurrence of each found string, longest first, with a stable numbered
 * placeholder. Existing placeholders are left alone and numbering continues after them.
 */
export function applyMask(text: string, found: { orig: string; kind: MaskKind }[]): { masked: string; spans: MaskSpan[] } {
  const counters: Record<string, number> = {};
  for (const [, type, n] of text.matchAll(/\[([A-Z_]+)_(\d+)\]/g)) counters[type!] = Math.max(counters[type!] ?? 0, Number(n));
  const byOrig = new Map<string, MaskSpan>();
  for (const f of [...found].sort((a, b) => b.orig.length - a.orig.length)) {
    if (byOrig.has(f.orig)) continue;
    counters[f.kind] = (counters[f.kind] ?? 0) + 1;
    byOrig.set(f.orig, { orig: f.orig, kind: f.kind, ph: `[${f.kind}_${counters[f.kind]}]` });
  }
  if (!byOrig.size) return { masked: text, spans: [] };
  const alts = [...byOrig.keys()].sort((a, b) => b.length - a.length).map(escapeRe);
  const re = new RegExp(`${PLACEHOLDER.source}|(?<![\\p{L}\\p{N}])(?:${alts.join("|")})(?![\\p{L}\\p{N}])`, "gu");
  const masked = text.replace(re, (m) => byOrig.get(m)?.ph ?? m);
  return { masked, spans: [...byOrig.values()] };
}

/** Splits a comma/newline-separated list of extra words to hide. */
export function parseExtraWords(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of input.split(/[,\n;]/).map((x) => x.trim().replace(/\s+/g, " "))) {
    if (w.length < 2 || seen.has(w.toLowerCase())) continue;
    seen.add(w.toLowerCase());
    out.push(w);
  }
  return out;
}

/**
 * Hides extra words the model missed (e.g. lowercase Hinglish names) in already-masked text.
 * Whole-word, case-insensitive; each distinct word becomes [PERSON_n], numbered after the
 * existing [PERSON_n]. Existing placeholders are never touched. `spans` has one entry per
 * distinct matched spelling (sharing the placeholder of its word).
 */
export function maskExtraNames(text: string, words: string[]): { masked: string; spans: MaskSpan[] } {
  const list = parseExtraWords(words.join(",")).filter((w) => !w.includes("["));
  if (!list.length) return { masked: text, spans: [] };
  let counter = 0;
  for (const [, n] of text.matchAll(/\[PERSON_(\d+)\]/g)) counter = Math.max(counter, Number(n));
  const phOf = new Map<string, string>(); // lowercase word -> placeholder, allocated on first match
  const spans = new Map<string, MaskSpan>();
  const alts = [...list].sort((a, b) => b.length - a.length).map(escapeRe);
  const re = new RegExp(`${PLACEHOLDER.source}|(?<![\\p{L}\\p{N}])(?:${alts.join("|")})(?![\\p{L}\\p{N}])`, "giu");
  const masked = text.replace(re, (m) => {
    if (m.startsWith("[")) return m; // an existing placeholder
    const key = m.toLowerCase();
    let ph = phOf.get(key);
    if (!ph) {
      ph = `[PERSON_${++counter}]`;
      phOf.set(key, ph);
    }
    if (!spans.has(m)) spans.set(m, { orig: m, ph, kind: "PERSON" });
    return ph;
  });
  return { masked, spans: [...spans.values()] };
}

/** The rule pass: emails, IDs and phone numbers. */
export function ruleMatches(text: string): { orig: string; kind: MaskKind }[] {
  const out: { orig: string; kind: MaskKind }[] = [];
  let rest = text.replace(PLACEHOLDER, " ");
  for (const { kind, re } of RULES) {
    for (const m of rest.matchAll(re)) out.push({ orig: m[0].trim(), kind });
    rest = rest.replace(re, " ");
  }
  return out;
}

/** Splits one line into plain text and masked spans, for the scramble animation. */
export function partsOf(line: string, spans: MaskSpan[]): (string | MaskSpan)[] {
  if (!spans.length) return [line];
  const alts = [...spans].sort((a, b) => b.orig.length - a.orig.length).map((s) => escapeRe(s.orig));
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts.join("|")})(?![\\p{L}\\p{N}])`, "gu");
  const out: (string | MaskSpan)[] = [];
  let at = 0;
  for (const m of line.matchAll(re)) {
    if (m.index! > at) out.push(line.slice(at, m.index));
    out.push(spans.find((s) => s.orig === m[0])!);
    at = m.index! + m[0].length;
  }
  if (at < line.length) out.push(line.slice(at));
  return out;
}

/* ------------------------------ worker client ------------------------------ */

export type NerStatus = { state: "idle" | "loading" | "ready" | "failed"; pct: number; loadedMb: number; totalMb: number; ms?: number; error?: string };
let status: NerStatus = { state: "idle", pct: 0, loadedMb: 0, totalMb: 0 };
const listeners = new Set<() => void>();
const setStatus = (s: Partial<NerStatus>) => {
  status = { ...status, ...s };
  listeners.forEach((l) => l());
};
let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (t: NerToken[][]) => void; reject: (e: Error) => void; progress?: (done: number, total: number) => void }>();

/** Starts downloading and loading the model in the worker. Safe to call many times. */
export function preloadNer(): void {
  if (worker) return;
  try {
    worker = new Worker(new URL("./ner.worker.ts", import.meta.url), { type: "module" });
  } catch (e) {
    setStatus({ state: "failed", error: (e as Error).message });
    return;
  }
  const started = performance.now();
  setStatus({ state: "loading", pct: 0 });
  worker.onmessage = (ev: MessageEvent) => {
    const m = ev.data as
      | { type: "progress"; pct: number; loaded: number; total: number }
      | { type: "ready" }
      | { type: "error"; message: string; id?: number }
      | { type: "result"; id: number; tokens: NerToken[][] }
      | { type: "chunk"; id: number; done: number; total: number };
    if (m.type === "chunk") pending.get(m.id)?.progress?.(m.done, m.total);
    else if (m.type === "progress") setStatus({ pct: Math.round(m.pct), loadedMb: m.loaded / 1e6, totalMb: m.total / 1e6 });
    else if (m.type === "ready") setStatus({ state: "ready", pct: 100, ms: Math.round(performance.now() - started) });
    else if (m.type === "result") {
      pending.get(m.id)?.resolve(m.tokens);
      pending.delete(m.id);
    } else if (m.type === "error") {
      if (m.id != null) {
        pending.get(m.id)?.reject(new Error(m.message));
        pending.delete(m.id);
      } else setStatus({ state: "failed", error: m.message });
    }
  };
  worker.onerror = (e) => setStatus({ state: "failed", error: e.message || "worker failed to start" });
  worker.postMessage({ type: "load" });
}

export function useNerStatus(): NerStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );
}

function waitReady(timeoutMs: number): Promise<boolean> {
  if (status.state === "ready") return Promise.resolve(true);
  if (status.state === "failed") return Promise.resolve(false);
  return new Promise((resolve) => {
    const t = setTimeout(() => done(false), timeoutMs);
    const check = () => {
      if (status.state === "ready") done(true);
      else if (status.state === "failed") done(false);
    };
    const done = (ok: boolean) => {
      clearTimeout(t);
      listeners.delete(check);
      resolve(ok);
    };
    listeners.add(check);
  });
}

function runModel(chunks: string[], progress?: (done: number, total: number) => void): Promise<NerToken[][]> {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject, ...(progress ? { progress } : {}) });
    worker!.postMessage({ type: "run", id, chunks });
  });
}

/** Masks text on the device: rules always, plus the NER model when it is available. */
export async function maskOnDevice(text: string, opts: { timeoutMs?: number; onProgress?: (done: number, total: number) => void } = {}): Promise<MaskResult> {
  preloadNer();
  const found = ruleMatches(text);
  const ok = await waitReady(opts.timeoutMs ?? 60_000);
  if (!ok) {
    return {
      ...applyMask(text, found),
      mode: "rules",
      warning: `On-device model unavailable${status.error ? ` (${status.error})` : ""}. Only emails, phone numbers and IDs were masked; names and places were not. Review the text before continuing.`,
    };
  }
  try {
    const chunks = chunkText(text);
    const tokens = await runModel(chunks, opts.onProgress);
    chunks.forEach((c, i) => found.push(...entitiesIn(c, tokens[i] ?? [])));
    return { ...applyMask(text, found), mode: "model" };
  } catch (e) {
    return {
      ...applyMask(text, found),
      mode: "rules",
      warning: `On-device model failed (${(e as Error).message}). Only emails, phone numbers and IDs were masked. Review the text before continuing.`,
    };
  }
}
