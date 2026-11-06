/**
 * Demo configuration. Everything on-chain in this build is simulated in the
 * browser; numbers follow apps/server/src/fixtures.ts so the real build matches.
 */
export const BRAND = {
  name: "HISSA",
  devanagari: "हिस्सा",
  tagline: "Your hissa of every sale.",
  meaning: "Hindi for “share”",
};

/** Shows हिस्सा next to the wordmark (brand artwork). Set false for English-only text. */
export const SHOW_DEVANAGARI = true;

/** Shows a small "simulated" badge in the nav. Turn off for a clean recording. */
export const SHOW_SIM_BADGE = true;

export const ACCOUNTS = {
  treasury: "0.0.5864913",
  agent: "0.0.6011742",
  hcsTopic: "0.0.6011790",
  arkivWriter: "0x0F58223AAfF9C6e2534aaD09a996048175C04C96",
};

export const PRICES = {
  insightReport: 3, // HBAR
  record: { bronze: 0.5, silver: 1, gold: 2 },
};

export const PRIVACY = { kMin: 50, epsilon: 1.0, smallCell: 20, sellerShare: 0.8 };

export const AGENT_DEFAULTS = { budget: 10, perPurchase: 5, daily: 25 };

export const SOURCES = [
  { id: "chatgpt", name: "ChatGPT", hint: "conversations.json" },
  { id: "claude", name: "Claude", hint: "conversations.json" },
  { id: "claude_code", name: "Claude Code", hint: "~/.claude/projects/*.jsonl" },
  { id: "codex", name: "Codex", hint: "~/.codex/sessions/*.jsonl" },
  { id: "whatsapp", name: "WhatsApp", hint: "Export chat · .txt" },
  { id: "telegram", name: "Telegram", hint: "result.json" },
] as const;
