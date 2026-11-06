# Data sources and third-party data

Which exports the product accepts, in what order, and the rule for messages written by people other than the uploader. Companion to [architecture.md](architecture.md). Items tagged **verify:** have not been checked against a real export yet.

## 1. Rule: only the uploader's own words become data

Messenger exports, and some AI tool transcripts, contain text written by other people (or produced by tools) who never agreed to anything. So:

- **Facts are extracted only from the uploader's own messages** (`role: self`).
- **Other people's messages may only help interpret context** (for example, to understand what the uploader was replying to). They are **never stored, excerpted, sold or counted** in insights.
- **Assistant replies and tool output** (AI answers, file contents, command output) are treated the same way as other people's messages: context only, never stored or excerpted.
- **The rule applies before anything leaves the device.** The parser tags every message with a role. Masking, facet extraction and excerpt selection receive the uploader's messages, plus a bounded window of context that is discarded after extraction.
- **Each upload records which participant is the uploader.** Where the export does not say (WhatsApp, Telegram chat exports), the user picks themselves from the participant list before parsing continues.

## 2. Common format

Every parser outputs the same structure, so masking and extraction are written once:

```
Conversation {
  source:        chatgpt | claude | claude_code | codex | whatsapp | telegram | ...
  conversation_id
  started_at, ended_at
  messages[]: {
    role:  self | other | assistant | tool
    text
    time
  }
}
```

Only `self` messages are eligible for facets and excerpts. `other`, `assistant` and `tool` messages are context only (section 1).

## 3. Sources for the first build

| Source | How the user gets it | Format | Who is `self` | Notes |
| --- | --- | --- | --- | --- |
| **ChatGPT** | Settings → Data controls → Export data (emailed link) | zip with `conversations.json`; each conversation is a tree of message nodes (`mapping`) | `author.role = user` | Walk the tree along the current branch; skip system and tool nodes. **verify:** current field names |
| **Claude.ai** | Settings → Privacy → Export data (emailed link) | zip with `conversations.json` (plus `users.json`, `projects.json`) | `sender = human` | **verify:** current field names |
| **Claude Code** | No export needed: local session files at `~/.claude/projects/<project>/<session>.jsonl` | JSONL, one event per line; `type` is `user` or `assistant`, with `message.content` blocks (`text`, `tool_use`, `tool_result`), plus `cwd`, `gitBranch`, `timestamp` | `type = user` text blocks only | `tool_result` blocks are tool output, not the user's words. Checked on a local file 2026-11-06 |
| **Codex CLI** | No export needed: local session files at `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | JSONL events | user messages | **verify:** path and event format on a real install |
| **WhatsApp** | Chat → More → Export chat (one chat at a time, "without media") | `.txt`; line layout differs by phone OS and locale, e.g. `[dd/mm/yy, hh:mm:ss] Name: text` (iOS) vs `dd/mm/yy, hh:mm - Name: text` (Android) | User picks their name | Handle multi-line messages, `<Media omitted>`, system lines, 12/24-hour clocks |
| **Telegram** | Telegram Desktop only → Settings → Advanced → Export Telegram data, or per-chat Export chat history; choose "Machine-readable JSON" | `result.json` with `messages[]` (`from`, `from_id`, `date`, `text`); `text` can be a string or an array of entity parts | User picks themselves (or `from_id` matches the account in a full export) | Mobile apps cannot export |

### Extra care for coding tools (Claude Code, Codex)

Coding transcripts carry things ordinary chats rarely do: API keys, tokens, private keys, `.env` contents, internal hostnames, file paths with usernames, and pasted code that belongs to an employer. Before masking:

- Drop every `tool_use` and `tool_result` block; keep only the user's typed text.
- Run a secret scanner over the remaining text (key and token patterns, high-entropy strings, `-----BEGIN ... PRIVATE KEY-----`) and remove matches entirely rather than masking them.
- Replace file paths and working directories with placeholders.
- Never keep code blocks as excerpts.

The value in these transcripts is what the person is building, learning, comparing or struggling with, not the code itself.

## 4. Later sources (officially noted, not in the first build)

| Group | Sources |
| --- | --- |
| AI chats | Gemini (Google Takeout → My Activity → Gemini Apps), DeepSeek, Grok, Microsoft Copilot, Meta AI (each via its privacy or data export; **verify:** formats), Perplexity (per-thread Markdown only; **verify:** no bulk export) |
| Messengers | Instagram DMs and Facebook Messenger (Accounts Center → Download your information, JSON; has a known text-encoding bug to repair), Discord (data package, per-channel `messages.json`), X DMs (archive, `direct-messages.js`), Snapchat, LinkedIn, LINE |
| Intent and purchases | Google Search and YouTube history (Takeout, JSON), Reddit data request (`comments.csv`, `posts.csv`), Amazon "Request your data" (order history CSV), X posts (`tweets.js`) |
| Fallback | Pasted text, or any `.txt`, `.md`, `.csv` or `.json` file |
| Media | Images and audio (voice notes in WhatsApp exports) stay on the roadmap |

## 5. Not supported

No official export exists, so these are out of scope: Signal, iMessage, WeChat.
