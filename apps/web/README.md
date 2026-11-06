# apps/web — Hissa (हिस्सा), frontend-only demo

*Your hissa of every sale.* Hissa is Hindi for “share”.

A clickable walkthrough of the whole product. Hedera payments are real when the demo
API runs (see below), listings and receipts live encrypted on Arkiv, and 0G inference is
real when the API also has `ZG_API_KEY`.

```bash
# terminal 1 — demo API, real Hedera testnet payments (repo root, needs .env)
npm install
npm run demo:api          # http://localhost:4021

# terminal 2 — the app
cd apps/web && npm install
npm run dev               # http://localhost:5173
```

**Live only.** The nav shows `LIVE · HEDERA TESTNET` when the demo API is
reachable: record purchases (1 ℏ) and Telegram messages (0.5 ℏ) are real x402 payments
from the buyer agent to the treasury, each logged to the HCS topic, and *Pay out* sends
the seller's 80% from the treasury as a Hedera Scheduled Transaction. Every hash links
to HashScan, and the header shows live balances from the mirror node. Without the API
(or if it drops mid-demo) discovery, payment and publish are refused and the app shows
"Marketplace API unavailable"; nothing is faked.

**API override.** Open the app with `?api=<API URL>` (for example an HTTPS tunnel) to
point it at a remote API; the value is remembered in the browser and `?api=reset` clears it.
The API must allow the web origin via `ALLOWED_ORIGINS`.

**On-device masking.** Names and places are masked in the browser by a small NER model
(`Xenova/bert-base-NER`, int8, about 109 MB, run with Transformers.js in a Web Worker and
cached after the first download), plus regex for emails and phone numbers. The seller
reviews the masked text before anything leaves the device. Brands are kept on purpose.

**0G Private Computer.** 0G never masks. With `ZG_API_KEY` in `.env`, these are sealed
(TEE) 0G calls through the demo API:
- seller: classify the masked text into facets (domain, age band, budget, products, events);
  the top-level domain becomes the public Arkiv tag, the rest stays inside the ciphertext;
- buyer, both products: request or idea → filters (and, for an idea, one measurable question);
- buyer, *Validate an idea*: the anonymised report (label → themes → noised shares → report
  and verdict) over people who opted in with `consent_insights`.
Each call's request ID shows on the page and as a `0G TEE` row on the Public Ledger.

**Two buyer products.**
- *Validate an idea* (anonymised analytics, 2 ℏ): needs at least 50 consenting people or it
  refuses before payment. Real consenting listings come from Arkiv; for the beauty demo a
  clearly labelled synthetic seed panel tops the cohort up to 50. x402 settles only after the
  report is delivered; 80% of the price is split across the people counted (real sellers are
  credited on Arkiv and paid out in batches).
- *Buy training data* (pseudonymised records, 1 ℏ each): Arkiv discovery, per-record x402.

Still simulated: the Telegram bot.

| Account | Role |
| --- | --- |
| `0.0.11342909` | Buyer agent, pays with x402; topped up from the treasury when below 12 ℏ |
| `0.0.10453173` | Platform treasury, receives payments, pays sellers |
| `0.0.10502605` | Demo seller (Priya), `SELLER_HEDERA_ACCOUNT_ID` |
| `0.0.11342910` | HCS topic, one message per agent payment |

## Demo path (fits in 3 minutes; the clicks take about 40 seconds)

Three roles, one page each. A pill in the bottom-right shows the next step (`` ` `` hides it).

| Page | Who | What |
| --- | --- | --- |
| Seller | Priya, the data owner | Upload, mask, publish with consent; earnings and payout; her Telegram |
| Buyer | AI company | Describe the data you need, the agent buys it over x402, message sellers |
| Public Ledger | Anyone | Every sale, message and payout. Listing IDs and transactions, no names |

1. **Seller** — *Use sample export* → masked on the device, classified by 0G → keep *Include me in
   anonymised analytics* on, turn on *Let buyers message me* → *Encrypt & publish*.
2. **Buyer · Validate an idea** — keep the sample idea, *Check against real data*: 0G turns
   it into a question, Arkiv counts consenting people, the agent pays 2 ℏ, 0G writes the
   anonymised report with a verdict. Try the laptop idea: too few people, nothing charged.
   **Buyer · Buy training data** — keep the sample request, *Find data*. 0G turns it into filters, Arkiv
   returns matching listings (locked; the free preview is tags only), the agent pays
   1 ℏ per record and each card unlocks. Then *Send to 1 seller* (0.5 ℏ, via the
   Telegram relay; the buyer never sees the handle).
3. **Seller** — Priya's Telegram shows the paid message; tap *Interested*. Then *Revoke*.
4. **Buyer** — *Send follow-up*: refused before payment, the listing is gone from Arkiv.
5. **Seller** — *Pay out*; **Public Ledger** shows every payment without names.

Try the laptops example on the Buyer page: no seller matches, nothing is spent.

Reset everything with ↺ in the nav. State survives a page refresh (sessionStorage).

## Notes

- `src/config.tsx`: brand (`BRAND`; `SHOW_DEVANAGARI` hides हिस्सा for English-only text), the `PREVIEW · SIMULATED` badge (`SHOW_SIM_BADGE`,
  turn off for a clean recording), accounts, prices, privacy parameters.
- `src/components/HissaMark.tsx`: the logo — a seeded particle pie with the 20% slice pulled out.
- `src/demo-data.tsx`: the synthetic chat, facets, cohort sizes and report themes.
- Source files are `.tsx` and the Vite config is `.js` so the root `tsconfig.json`
  (`apps/**/*.ts`) does not pick them up.
- Dropping a real file only shows its name; the preview never reads it and always
  uses the synthetic sample.
