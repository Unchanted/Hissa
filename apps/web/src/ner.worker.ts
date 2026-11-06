/// <reference lib="webworker" />
/**
 * Runs Xenova/bert-base-NER inside the browser, off the main thread. Receives text chunks,
 * returns raw tokens; grouping and masking happen in ner.ts. Nothing is sent anywhere except
 * the one-time model download from the Hugging Face hub (cached by the browser afterwards).
 */
import { env, pipeline } from "@huggingface/transformers";

env.allowLocalModels = false; // never look for /models on the dev server
env.useBrowserCache = true;

type Ner = (texts: string[], options: { ignore_labels: string[] }) => Promise<unknown>;
let ner: Promise<Ner> | null = null;

function load(): Promise<Ner> {
  ner ??= pipeline("token-classification", "Xenova/bert-base-NER", {
    dtype: "q8",
    device: "wasm",
    progress_callback: (p: { status: string; progress?: number; loaded?: number; total?: number }) => {
      if (p.status === "progress_total") postMessage({ type: "progress", pct: p.progress ?? 0, loaded: p.loaded ?? 0, total: p.total ?? 0 });
    },
  }).then((pipe) => {
    postMessage({ type: "ready" });
    return pipe as unknown as Ner;
  });
  return ner;
}

self.onmessage = async (ev: MessageEvent<{ type: "load" } | { type: "run"; id: number; chunks: string[] }>) => {
  const m = ev.data;
  if (m.type === "load") {
    load().catch((e: Error) => {
      ner = null;
      postMessage({ type: "error", message: e.message });
    });
    return;
  }
  try {
    const pipe = await load();
    const tokens: unknown[] = [];
    for (const chunk of m.chunks) {
      const out = await pipe([chunk], { ignore_labels: ["O"] });
      // One input in, one result out; some versions return the inner array directly.
      const arr = Array.isArray(out) && Array.isArray(out[0]) ? out[0] : out;
      tokens.push(
        (arr as { entity: string; score: number; index: number; word: string; start?: number; end?: number }[]).map((t) => ({
          entity: t.entity,
          score: t.score,
          index: t.index,
          word: t.word,
          ...(t.start != null ? { start: t.start, end: t.end } : {}),
        })),
      );
    }
    postMessage({ type: "result", id: m.id, tokens });
  } catch (e) {
    postMessage({ type: "error", id: m.id, message: (e as Error).message });
  }
};
