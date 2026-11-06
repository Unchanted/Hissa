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

/**
 * Hedera testnet accounts (real, from .env). Used in simulated mode; in live mode
 * the IDs come from the demo API's /health.
 */
export const ACCOUNTS = {
  relayBot: "@HissaRelayBot",
  treasury: "0.0.10453173",
  agent: "0.0.11342909",
  hcsTopic: "0.0.11342910",
  seller: "0.0.10502605", // SELLER_HEDERA_ACCOUNT_ID
  arkivWriter: "0x0F58223AAfF9C6e2534aaD09a996048175C04C96",
};

export const PRICES = {
  record: 1, // HBAR, silver tier (fixtures.ts)
  contact: 0.5, // HBAR per paid Telegram message, via the relay bot
};

export const SELLER_SHARE = 0.8;

/** Starting balances shown in the header (AGENT_INITIAL_HBAR in .env is 30). */
export const START_BALANCE = { buyer: 30, seller: 0 };

export const hashscanAccount = (id: string) => `https://hashscan.io/testnet/account/${id}`;

export const AGENT_DEFAULTS = { budget: 10, perPurchase: 5, maxRecords: 3 };

export const SOURCES = [
  { id: "chatgpt", name: "ChatGPT", hint: "conversations.json" },
  { id: "claude", name: "Claude", hint: "conversations.json" },
  { id: "claude_code", name: "Claude Code", hint: "~/.claude/projects/*.jsonl" },
  { id: "codex", name: "Codex", hint: "~/.codex/sessions/*.jsonl" },
  { id: "whatsapp", name: "WhatsApp", hint: "Export chat · .txt" },
  { id: "telegram", name: "Telegram", hint: "result.json" },
] as const;
