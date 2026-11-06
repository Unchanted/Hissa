# apps/web — Hissa (हिस्सा), frontend-only demo

*Your hissa of every sale.* Hissa is Hindi for “share”.

A clickable walkthrough of the whole product with no backend. Every Arkiv, 0G and
Hedera call is simulated in the browser with realistic IDs and timings; nothing
leaves the page. Prices, k_min and agent limits match `apps/server/src/fixtures.ts`.

```bash
cd apps/web
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
```

## Demo path (about 4 minutes)

A pill in the bottom-right always shows the next step (toggle with the `` ` `` key).

1. **Landing** — hero, the four-hop protocol, the two privacy treatments.
2. **Seller** — *Load Priya's ChatGPT export* → assistant replies drop out, PII
   scrambles into placeholders → 0G TEE extraction with a request ID → review public
   tags vs encrypted content, set the two consent toggles and expiry → encrypt, seal and
   publish to Arkiv.
3. **Merchant agent** — *Start agent*. It queries Arkiv, gets the cohort check,
   receives `402`, checks its own spending policy, pays over x402, retries, runs 0G
   labelling, applies the privacy layer, writes the Arkiv receipt and the HCS log, then
   buys one record. The insight report and the watermarked record appear below.
   Try `region = IN-west`: the cohort drops below 50 and the request is refused free.
4. **Revoke** — back on Seller, switch off *Allow sale of my record*, then *Run agent
   again*: the record purchase is refused before payment.
5. **Ledger** — receipts from Arkiv, Priya's earnings, *Run payout batch* (Hedera
   Scheduled Transaction), *Verify inclusion* (Merkle proof against the receipt).

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
