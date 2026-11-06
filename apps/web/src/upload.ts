export type ChatLine = { role: "self" | "assistant" | "other"; text: string };
export type ChatData = { source: string; lines: ChatLine[]; sample: boolean };

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const row = value as Record<string, unknown>;
  if (Array.isArray(row.parts)) return row.parts.filter((part): part is string => typeof part === "string").join("\n");
  return typeof row.text === "string" ? row.text : "";
}

export function parseChatExport(raw: string): ChatData {
  const parsed = JSON.parse(raw) as unknown;
  const roots = Array.isArray(parsed) ? parsed : [parsed];
  for (const root of roots) {
    if (!root || typeof root !== "object") continue;
    const row = root as Record<string, unknown>;
    if (Array.isArray(row.chat_messages)) {
      const lines = row.chat_messages.flatMap((item): ChatLine[] => {
        if (!item || typeof item !== "object") return [];
        const message = item as Record<string, unknown>;
        const text = asText(message.text);
        if (!text) return [];
        return [{ role: message.sender === "human" ? "self" : message.sender === "assistant" ? "assistant" : "other", text }];
      });
      if (lines.some((line) => line.role === "self")) return { source: "claude", lines, sample: false };
    }
    const mapping = row.mapping && typeof row.mapping === "object" ? Object.values(row.mapping as Record<string, unknown>) : [];
    const mapped = mapping.flatMap((node): ChatLine[] => {
      if (!node || typeof node !== "object") return [];
      const message = (node as Record<string, unknown>).message;
      if (!message || typeof message !== "object") return [];
      const value = message as Record<string, unknown>;
      const author = value.author && typeof value.author === "object" ? value.author as Record<string, unknown> : {};
      const text = asText(value.content);
      if (!text) return [];
      return [{ role: author.role === "user" ? "self" : author.role === "assistant" ? "assistant" : "other", text }];
    });
    if (mapped.some((line) => line.role === "self")) return { source: "chatgpt", lines: mapped, sample: false };
    const rawMessages = Array.isArray(row.messages) ? row.messages : [];
    const generic = rawMessages.flatMap((item): ChatLine[] => {
      if (!item || typeof item !== "object") return [];
      const message = item as Record<string, unknown>;
      if (typeof message.role !== "string") return [];
      const text = asText(message.content ?? message.text);
      if (!text) return [];
      return [{ role: message.role === "user" ? "self" : message.role === "assistant" ? "assistant" : "other", text }];
    });
    if (generic.some((line) => line.role === "self")) return { source: "import", lines: generic, sample: false };
  }
  throw new Error("Unsupported chat export. Supported formats are ChatGPT conversations.json, Claude chat_messages, or messages with explicit role fields.");
}

export function maskBasicText(text: string): string {
  let email = 0;
  let phone = 0;
  return text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, () => `[EMAIL_${++email}]`)
    .replace(/\+?\d[\d().\s-]{7,}\d/g, () => `[PHONE_${++phone}]`);
}
