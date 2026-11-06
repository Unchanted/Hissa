import assert from "node:assert/strict";
import test from "node:test";
import { parseChatExport, maskBasicText } from "../../../apps/web/src/upload.ts";

test("supported exports retain explicit authorship and reject unidentified messages", () => {
  const chatgpt = parseChatExport(JSON.stringify([{ mapping: {
    a: { message: { author: { role: "user" }, content: { parts: ["my words"] } } },
    b: { message: { author: { role: "assistant" }, content: { parts: ["assistant words"] } } },
  } }]));
  assert.deepEqual(chatgpt.lines.filter((m) => m.role === "self").map((m) => m.text), ["my words"]);
  const claude = parseChatExport(JSON.stringify({ chat_messages: [{ sender: "human", text: "mine" }, { sender: "assistant", text: "not mine" }] }));
  assert.deepEqual(claude.lines.filter((m) => m.role === "self").map((m) => m.text), ["mine"]);
  assert.throws(() => parseChatExport(JSON.stringify({ messages: [{ text: "unknown author" }] })));
  assert.throws(() => parseChatExport("unstructured chat"));
});

test("the local mask removes basic email and phone identifiers", () => {
  const masked = maskBasicText("Contact me at person@example.com or +91 98765 43210. Keep the product name Serum.");
  assert.ok(!masked.includes("person@example.com"));
  assert.ok(!masked.includes("98765"));
  assert.ok(masked.includes("Serum"));
});
