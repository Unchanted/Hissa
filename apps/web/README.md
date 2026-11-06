# apps/web — Hissa (हिस्सा), frontend-only demo

*Your hissa of every sale.* Hissa is Hindi for “share”.

A clickable walkthrough of the whole product. Hedera payments are real when the demo
API runs (see below), and 0G inference is real when the API also has `ZG_API_KEY`;
Arkiv is still simulated in the browser.

```bash
# terminal 1 — demo API, real Hedera testnet payments (repo root, needs .env)
npm install
npm run demo:api          # http://localhost:4021

# terminal 2 — the app
cd apps/web && npm install
npm run dev               # http://localhost:5173
```

**Live vs simulated.** The nav shows `LIVE · HEDERA TESTNET` when the demo API is
reachable: record purchases (1 ℏ) and Telegram messages (0.5 ℏ) are real x402 payments
from the buyer agent to the treasury, each logged to the HCS topic, and *Pay out* sends
the seller's 80% from the treasury as a Hedera Scheduled Transaction. Every hash links
to HashScan, and the header shows live balances from the mirror node. Without the API
the app shows `SIMULATED` and fakes the same flow; if the API drops mid-demo, payments
fall back to simulated and say so in the agent log.

**0G Private Computer.** With `ZG_API_KEY` in `.env`, three steps are sealed (TEE) 0G
calls through the demo API: the seller's upload analysis (facets become the listing's
public tags, and 0G catches the name on-device masking missed, shown in purple), the
buyer's request → filters, and the cohort report. Each call's request ID shows on the page
and on the Public Ledger as a `0G TEE` row. Without the key, or if 0G fails, each step says
"simulated" and the ledger gets no 0G rows.

Still simulated in both modes: Arkiv writes (lane B), the Telegram bot. Listings and consent live in the API's memory until Arkiv is wired in, so
restarting the API forgets Priya's listing — click ↺ and publish again.

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

1. **Seller** — *Use sample export* → mask + 0G → turn on *Let buyers message me* → *Encrypt & publish*.
2. **Buyer** — keep the sample request, *Find data*. 0G turns it into filters, Arkiv
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
