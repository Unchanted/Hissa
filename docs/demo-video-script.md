# Hissa: demo video script (target 2:55, hard limit < 3:00)

Roughly 150 spoken words per minute, so about 430 words of voice-over in total. The live demo is the main content; slides appear for the first ~20 s only.

## 1. Pitch

**One line:** Hissa is a marketplace where people sell their own chat data, set the consent themselves, and keep 80% of every sale.

**What breaks if 0G is removed:** Without 0G Private Computer, nobody could read the masked chats, turn buyer ideas into filters, or write the anonymised report without exposing the data to an operator. 0G's sealed TEE inference is the only reason a buyer gets insight without anyone seeing a person's chat.

## 2. Pre-flight checklist (before hitting record)

- [ ] Open https://hissa.tech once and let the on-device model finish (about 110 MB, cached afterwards). Look for "on-device model ready" on the Seller page.
- [ ] Health check in a tab: https://api.hissa.tech/health returns OK. The nav should read `LIVE · HEDERA TESTNET`.
- [ ] Agent budget (the "AGENT BUDGET" control on the Buyer page) is high enough for 2 ℏ + 1 ℏ + spare. The buyer agent is topped up when below 12 ℏ; confirm the balance in the header.
- [ ] Reset state with the **↺** button in the nav, so Seller starts empty and the Ledger is clean for the take.
- [ ] Have the sample export ready: use the **Use sample export** button (do not drag in a real file).
- [ ] Pre-open tabs: HashScan (https://hashscan.io/testnet/account/0.0.11342909 and topic 0.0.11342910) and the Arkiv Rabdi explorer. Keep them as backup shots only.
- [ ] Confirm `SHOW_SIM_BADGE` setting is as you want it. Leave honest labels (synthetic panel, simulated Telegram) visible. Do not hide them.
- [ ] Close all other tabs and notifications. Record at 1080p, browser zoom so labels are readable. Hissa.pptx slides 1-2 ready in a separate window.
- [ ] Do one full dry run first to warm the API (0G classification ~6-8 s, report ~24-40 s). Reset with ↺ again before the real take.

## 3. Shot list

| Time | Screen / action | Voice-over | Sponsor |
| --- | --- | --- | --- |
| 0:00-0:20 | Slide 1 (title: "Platforms profit from your chats. Hissa flips it."), then slide 2 (architecture / three sponsors). Cut to hissa.tech landing at 0:18. | "Every chat you have reveals what people want to buy. Platforms profit from it. You get nothing. Hissa, Hindi for 'share', flips that. You own the data, you set consent, and you get eighty percent of every sale. Three sponsors make it work: 0G for private AI, Arkiv for the database, Hedera for payments." | 0G, Arkiv, Hedera |
| 0:20-0:30 | Open **Seller**. Click **Use sample export**. Show the "ON YOUR DEVICE" panel and the "Masking runs in your browser. Nothing leaves this device unmasked." line. | "I'm Priya, a seller. I load a chat export. Masking happens here, in my browser." | (on-device) |
| 0:30-0:42 | Masked text appears ("Masked text ready", "on-device model ready"). Optionally type a name in the extra-names box (placeholder "e.g. swapnil, anand"). Point at masked names, and at the "NOT YOURS · DROPPED" panel. | "A small NER model and some rules mask names, phones and emails on my device. I can add names it missed. Only my own messages are kept. 0G never sees a raw name." | (on-device) |
| 0:42-0:55 | "Classifying in TEE…" turns to "Classified in TEE", with the "TEE verified" and "sealed in TEE ✓" request ID. Show the facets (domain, age band, budget, products). | "Now the masked text goes to 0G Private Computer. Inside a sealed TEE, it is classified into facets: domain, age band, budget, products. The request ID is the receipt." | **0G** |
| 0:55-1:10 | Consent block "YOU DECIDE": keep **Sell my record** and **Include me in anonymised analytics** on; turn on **Let buyers message me**. Show "PUBLIC ON ARKIV" note. Click **Encrypt & publish**. Show "ENCRYPTING", then "LIVE ON ARKIV" and the listing ID. | "I choose what's allowed: sell my record, include me in analytics, let buyers message me. Publish. The record is encrypted and listed on Arkiv with coarse tags and my consent, and an expiry date. Arkiv is our only database." | **Arkiv** |
| 1:10-1:20 | Open **Buyer**, tab **Validate an idea**. Show the sample idea in "YOUR IDEA" ("Young Indians are dropping skincare serums because they cost too much — a ₹299 trial size would sell."). Show AGENT BUDGET. | "Now I'm a brand. Before building a product, I want to test an idea against real people. My agent has a budget and no human approves its payments." | Hedera |
| 1:20-1:30 | Click **Check against real data · 2 ℏ**. Flow panel starts: "Understand the idea" (0G), "Count consenting people" (Arkiv), "Agent pays for the report" (Hedera). | "0G turns my idea into filters and one question. Arkiv counts people who opted in to analytics. Fewer than fifty, and it refuses before any payment." | 0G, Arkiv |
| 1:30-1:50 | The agent pays 2 ℏ; the payment line shows the x402 transaction. "Private analysis in the TEE" step runs ("Label each record → group into themes → add noise → write the report"). Talk over the steps (~25-40 s; trim in editing if needed). Point at the seed-panel label. | "The agent pays two HBAR over x402. Then 0G does the analysis in the TEE: label, group into themes, one vote per seller, Laplace noise, write the report. This cohort is one real seller plus a seed panel of sixty-nine synthetic people. It is labelled on screen." | **0G**, Hedera |
| 1:50-2:00 | Report appears: verdict chip ("Supported by the data" / "Partly supported" / "Not supported" / "Unclear"; expected: Partly supported), themes, "HOW YOUR ANSWER IS MADE" box: "At least 50 consenting people, or it doesn't run", "Noise added to every number (ε = 1)". Show the "Contributors get their share" step. | "Verdict: partly supported. Patterns and shares, never a quote, never a person. Eighty percent of the price goes to the people counted." | **0G**, Hedera |
| 2:00-2:15 | Tab **Buy training data**. Keep sample request, click **Find data**. Show "sealed in TEE ✓" for the request-to-filter step and the locked listing cards ("Free preview: tags only"). | "Second product: training data. 0G turns a plain request into filters, Arkiv returns matching listings. The free preview is tags only." | 0G, Arkiv |
| 2:15-2:25 | Agent pays 1 ℏ per record, cards unlock. Click **Download .jsonl**. Show "View x402 transactions on HashScan" link. | "The agent pays one HBAR per record. Each card unlocks as masked, pseudonymised records, and downloads as JSONL. Every payment links to HashScan." | **Hedera** |
| 2:25-2:40 | Open **Public Ledger**. Scroll the rows: Arkiv receipts, Hedera payments (click one HashScan link, flash the HCS topic tab), `0G TEE` rows with request IDs and sealed ✓. | "The Public Ledger shows everything without names: Arkiv receipts, Hedera payments, and 0G request IDs, sealed. Anyone can check." | All three |
| 2:40-2:50 | Back to **Seller**: show earnings under "YOUR HISSA" (ℏ earned), click **Pay out** if time (Hedera scheduled payout, "Paid out ✓"). Click **Upload more data** to show the multiple-listings flow. Show **Revoke** on the live listing. | "Priya sees her hissa, eighty percent of each sale, and can be paid out on Hedera. She can upload again, as many listings as she likes, each with its own consent, and revoke any of them whenever she wants." | Hedera, Arkiv |
| 2:50-2:55 | Slide or landing page with hissa.tech. | "Hissa: your data, your consent, your share. hissa.tech." | - |

If time is tight: drop the **Pay out** click and the HashScan click-through; keep the Ledger scroll.

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
6. **How do sellers get paid?** The buyer agent pays over x402 in HBAR on Hedera testnet. 80% of the price goes to contributors (for reports, split across the people counted), paid out in batches as Hedera scheduled transactions. Every payment is logged to an HCS topic.
7. **How does revocation work?** The seller flips consent or hits **Revoke**; this is a signed request confirmed on Arkiv. After revoke the listing is gone, and a follow-up purchase is refused before any payment.
8. **What is real and what is simulated?** Real: on-device masking, 0G sealed calls, Arkiv listings and receipts on Rabdi testnet, Hedera x402 payments, HCS log, payouts (testnet). Simulated: the Telegram relay bot (the 0.5 ℏ message payment is real, delivery is not), and the synthetic seed panel in the beauty cohort. This is a testnet demo.
9. **What does a report cost?** About $0.001-0.003 in 0G compute for a full report, with 5-6 sealed calls. A live run took about 24 s and about $0.0026. Buyers pay 2 ℏ.
10. **Why glm-5.3 vs 0gm?** We ran every job on each model (evidence files in `evidence/`). glm-5.3 classified uploads better, so it is first for classification, filters and the report. 0gm handled bulk labelling reliably at about 15x lower cost, so it labels and groups records. Each step falls back to the other model if the answer fails validation.
