# Hissa: demo video script (target 2:55, hard limit < 3:00)

Roughly 150 spoken words per minute, so about 430 words of voice-over in total. The live demo is the main content; slides appear for the first ~20 s only.

## 1. Pitch

**One line:** Hissa is a marketplace where people sell their own chat data, set the consent themselves, and keep 80% of every sale.

**What breaks if 0G is removed:** Without 0G Private Computer, nobody could read the masked chats, turn buyer ideas into filters, or write the anonymised report without exposing the data to an operator. 0G's sealed TEE inference is the only reason a buyer gets insight without anyone seeing a person's chat.

## 2. Pre-flight checklist (before hitting record)

- [ ] Open https://hissa.tech once and let the on-device model finish (about 110 MB, cached afterwards). Look for "on-device model ready" on the Seller page.
- [ ] Health check in a tab: https://api.hissa.tech/health returns OK. The nav should read `LIVE · HEDERA TESTNET`.
- [ ] AGENT BUDGET (Buyer page; options 5 / 10 / 20 ℏ, default 10) is set to **5 ℏ** for the take, for the budget-refusal beat. The buyer agent is topped up when below 12 ℏ; confirm the balance in the header.
- [ ] Dry run the budget refusal: with 5 ℏ, confirm which line appears (`budget limit · skip <id>` appears only when under 1 ℏ is left and a match is unowned; the report check refuses when under 2 ℏ is left). Re-run until the refusal is on screen at 2:08.
- [ ] Reset state with the **↺** button in the nav, so Seller starts empty and the Ledger is clean for the take.
- [ ] Have the sample export ready: use the **Use sample export** button (do not drag in a real file).
- [ ] Pre-open tabs: HashScan topic https://hashscan.io/testnet/topic/0.0.11342910 and account 0.0.11342909 (both are on-screen beats, not backups), plus the Arkiv Rabdi explorer (backup only).
- [ ] Submission: select **Hedera** as a partner and name both tracks in the write-up: "AI Agents That Pay: x402 on Hedera" (primary) and "No Solidity Allowed: Build with Hedera SDKs" (secondary).
- [ ] Confirm `SHOW_SIM_BADGE` setting is as you want it. Leave honest labels (synthetic panel, simulated Telegram) visible. Do not hide them.
- [ ] Close all other tabs and notifications. Record at 1080p, browser zoom so labels are readable. Hissa.pptx slides 1-2 ready in a separate window.
- [ ] Do one full dry run first to warm the API (0G classification ~6-8 s, report ~24-40 s). Reset with ↺ again before the real take.

## 3. Shot list

The Hedera beats (rows 1:05, 1:55, 2:08, 2:18 and 2:37) are required, not optional.

| Time | Screen / action | Voice-over | Sponsor |
| --- | --- | --- | --- |
| 0:00-0:18 | Slide 1 (title: "Platforms profit from your chats. Hissa flips it."), then slide 2 (architecture / three sponsors). Cut to hissa.tech landing at 0:16. | "Every chat you have reveals what people want to buy. Platforms profit; you get nothing. Hissa, Hindi for 'share', flips that: you own the data, set consent, and keep eighty percent of every sale. 0G for private AI, Arkiv for the database, Hedera for payments." | 0G, Arkiv, Hedera |
| 0:18-0:28 | Open **Seller**. Click **Use sample export**. Show the "ON YOUR DEVICE" panel and "Masking runs in your browser. Nothing leaves this device unmasked." | "I'm Priya, a seller. I load a chat export. Masking happens in my browser." | (on-device) |
| 0:28-0:38 | Masked text appears ("Masked text ready", "on-device model ready"). Point at masked names and the "NOT YOURS · DROPPED" panel. | "A small NER model and rules mask names, phones and emails on my device. Only my own messages are kept." | (on-device) |
| 0:38-0:50 | "Classifying in TEE…" turns to "Classified in TEE", with the "TEE verified" note and the request ID. Show the facets. | "The masked text goes to 0G Private Computer. Inside a sealed TEE it is classified into domain, age band, budget and products. The request ID is the receipt." | **0G** |
| 0:50-1:05 | Consent block "YOU DECIDE": keep **Sell my record** and **Include me in anonymised analytics** on; turn on **Let buyers message me**. Show "PUBLIC ON ARKIV". Click **Encrypt & publish**; show "ENCRYPTING", then "LIVE ON ARKIV" and the listing ID. | "I choose what's allowed: sell my record, join analytics, let buyers message me. Publish. The record is encrypted and listed on Arkiv with coarse tags, my consent and an expiry date. Arkiv is our only database." | **Arkiv** |
| 1:05-1:15 | Open **Buyer**, tab **Validate an idea**. Show the sample idea in "YOUR IDEA". **Set AGENT BUDGET to 5 ℏ** (buttons 5 / 10 / 20 ℏ; the default is 10). | "Now I'm a brand with an idea to test. My agent has a budget, and I cap it at five HBAR. No human approves its payments." | Hedera |
| 1:15-1:23 | Click **Check against real data · 2 ℏ**. Flow panel starts: "Understand the idea" (0G), "Count consenting people" (Arkiv), "Agent pays for the report" (Hedera). | "0G turns the idea into filters and one question. Arkiv counts people who opted in. Under fifty, it refuses before any payment." | 0G, Arkiv |
| 1:23-1:45 | The agent pays 2 ℏ; the "paid" line shows the transaction. "Private analysis in the TEE" runs (about 25-40 s; trim in editing). Point at the seed-panel label. | "The agent pays two HBAR over x402. Then 0G does the analysis in the TEE: label, group into themes, one vote per seller, Laplace noise, report. The cohort is one real seller plus sixty-nine labelled synthetic people." | **0G**, Hedera |
| 1:45-1:55 | Report appears: verdict chip (expected "Partly supported"; read whatever it shows), themes, "HOW YOUR ANSWER IS MADE" box. Show the "Contributors get their share" step. | "Verdict: partly supported. Patterns and shares, never a quote or a person. Eighty percent of the price goes to the people counted." | **0G**, Hedera |
| 1:55-2:08 | Tab **Buy training data**. Click **Find data**. Show the locked cards ("Free preview: tags only"). **Required Hedera beat:** in the agent console show `GET /records/<id> ← 402 · pay 1 ℏ`, `402 quote: 1 HBAR → 0.0.10453173 (budget left …, daily left …)`, `policy OK → signing HBAR transfer, no human approval`, then `settled on Hedera <tx> · unlocked`; cards unlock; click **Download .jsonl**. Brief cutaway (pre-recorded `npm run hedera:agent` terminal) to the payer lines `402 quote … policy OK → signing HBAR transfer, no human approval`. | "Second product: training data. The agent gets a 402 quote, checks its limits, and signs the HBAR transfer itself: no human approval. Each record unlocks as masked, pseudonymised JSONL." | 0G, Arkiv, **Hedera** |
| 2:08-2:18 | **Budget refusal (required, short).** Show the agent console line `budget limit · skip <listing id>` (or, if the report check is re-run instead, the flow error "Report costs 2 ℏ but the agent has … ℏ left. Nothing was charged."). Point at the "… ℏ left" counter. | "At five HBAR the budget runs out. The agent skips the purchase and nothing is charged." | **Hedera** |
| 2:18-2:30 | Click **View x402 transactions on HashScan**: show the "no human approval" modal header, click **Open on HashScan ↗** on one transaction (SUCCESS, agent to treasury). Then open HCS topic 0.0.11342910 in HashScan (the **HCS payment log ↗** link) and show the matching payment message. | "Every payment is a real Hedera transaction. Here it settled, and here is the matching message on the HCS topic." | **Hedera** |
| 2:30-2:37 | Open **Public Ledger**. Scroll the rows: Arkiv receipts, Hedera payments, `0G TEE` rows with request IDs. | "The Public Ledger shows it all without names: Arkiv receipts, Hedera payments, 0G request IDs. Anyone can check." | All three |
| 2:37-2:52 | Back to **Seller**: under "YOUR HISSA" show the ℏ earned and **click Pay out (required)**. Show "Paid out ✓" and open the executed schedule on HashScan (Schedule Service transfer treasury to seller). Flash **Revoke** on the live listing. | "Priya sees her hissa, eighty percent of each sale. One click pays her out through a Hedera scheduled transaction, executed here. She can revoke any listing, any time." | Hedera, Arkiv |
| 2:52-2:55 | Slide or landing page with hissa.tech. | "Hissa: your data, your consent, your share." | - |

If time is tight: cut **Upload more data**, the Ledger scroll, or the 0:28 masking beat. Do not cut the Hedera beats (402 and no-approval payment, HCS message, **Pay out**, budget refusal).

## 4. Fallbacks if something is slow

- **0G report (~24-40 s):** do not stay silent. Narrate the flow panel step by step: "0G labels each record, groups them into themes, one vote per seller, then Laplace noise, then writes the report." This is the planned voice-over; cut dead time in editing so the final stays under 3:00.
- **0G classification slow (>10 s):** "The masked text is being classified inside the TEE; that's a few seconds." Cut in editing.
- **Model still downloading:** this should never happen if pre-flight was done. If it does, stop, wait for "on-device model ready", re-record the take.
- **API unavailable:** the app shows "Marketplace API unavailable" and refuses rather than faking. Check https://api.hissa.tech/health, then retry. Do not narrate a fake success.
- **Insight returns Unclear / different verdict:** read the verdict as shown ("Verdict: <whatever it says>, patterns not people"). Do not claim "Partly supported" unless it appears.
- **Arkiv publish slow:** say "Arkiv is confirming the transaction on the Rabdi testnet" and cut in editing.
- **A take fails mid-way:** press ↺, re-run only that section, and stitch in editing.

## 5. Judge Q&A cheat sheet

1. **Why a TEE, why 0G?** The data is chats. Analysis needs a model, but the operator should not read them. 0G Private Computer runs every call in sealed private mode (TeeML providers only, no fallback to a non-TEE tier), and each call returns a receipt (request ID, provider, model, sealed flag).
2. **Why mask on-device, not in the TEE?** So names never leave the person's device at all. Masking runs in the browser (Transformers.js, `Xenova/bert-base-NER`, plus rules for emails, phones, IDs), and the seller reviews the masked text and can add names. 0G never masks and never sees raw names.
3. **How do k-anonymity and noise work?** The report refuses to run below 50 consenting people, before any payment. Each seller gets one vote, Laplace noise (ε = 1) is added to every number, and small themes are merged. No quotes, records or names leave the TEE.
4. **Is the cohort real?** For the beauty demo it is 1 real seller plus a 69-person synthetic seed panel to reach 50. It is labelled in the UI. Real consenting listings come from Arkiv.
5. **Why Arkiv as the only database?** Listings (encrypted), consent, revoke, expiry and receipts all live on Arkiv (Rabdi testnet). That gives consent and revocation a public, checkable audit trail, and seller earnings come from Arkiv receipts, not an in-memory balance.
6. **How do sellers get paid?** The buyer agent pays over x402 in HBAR on Hedera testnet. 80% of the price goes to contributors (for reports, split across the people counted), paid out in batches as Hedera scheduled transactions. Payments are logged to an HCS topic on a best-effort basis (a failed submission is logged as a warning, not retried from a durable queue).
7. **How does revocation work?** The seller flips consent or hits **Revoke**; this is a signed request confirmed on Arkiv. After revoke the listing is gone, and a follow-up purchase is refused before any payment.
8. **What is real and what is simulated?** Real: on-device masking, 0G sealed calls, Arkiv listings and receipts on Rabdi testnet, Hedera x402 payments, HCS log, payouts (testnet). Simulated: the Telegram relay bot (the 0.5 ℏ message payment is real, delivery is not), and the synthetic seed panel in the beauty cohort. This is a testnet demo.
9. **What does a report cost?** About $0.001-0.003 in 0G compute for a full report, with 5-6 sealed calls. A live run took about 24 s and about $0.0026. Buyers pay 2 ℏ.
10. **Why glm-5.3 vs 0gm?** We ran every job on each model (evidence files in `evidence/`). glm-5.3 classified uploads better, so it is first for classification, filters and the report. 0gm handled bulk labelling reliably at about 15x lower cost, so it labels and groups records. Each step falls back to the other model if the answer fails validation.
