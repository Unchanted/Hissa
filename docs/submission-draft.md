# Hissa — ETHGlobal Mumbai submission pack

Updated 7 November 2026 against latest main (`f20d11f`), the supplied submission form notes, current source code, public partner prize pages and independently checked Hedera mirror-node evidence. Demo URL and AI development tools confirmed by the team. Text under **Paste** is submission copy; notes and readiness checks are for the team.

## 1. One story, different entry points

**Core pitch:** AI needs human context. Hissa lets the people who create it control access and earn a share.

**Memorable opening:** Your conversations reveal what you want, what you compare, and why you walk away. That context has value. Where is your share?

Hissa means “share” in Hindi. Keep that human promise consistent across every presentation. The buyer is an AI agent acting for a business; the supplier is a person choosing to contribute their own words. Paid aggregate insights and separately consented record purchases are distinct product paths. The current insight demo combines real consenting Arkiv listings with a clearly labelled synthetic seed panel. These should not be presented as the same privacy treatment.

| Audience | Lead with | Show first | Return to the same promise |
| --- | --- | --- | --- |
| Finalist panel | People create valuable context but lack a direct way to license it and participate in its value. | Seller review → permission → agent purchase → receipt and earnings. | A market that connects human permission to agent demand. |
| Hedera — x402 + SDK tracks | Agents should be able to pay for permitted human data; contributors should receive their share. | HTTP 402 → signed HBAR payment → HashScan → HCS → executed HSS seller payout. | Native Hedera services connect agent purchases to contributor earnings without Solidity. |
| Arkiv | A marketplace needs shared, queryable availability and consent state. | Encrypted listing → public-tag query → consent change/revoke → fresh read. | People can change future availability; buyers can discover the current catalogue. |
| 0G | Conversations are unstructured; turning them into useful signals is the AI problem. | Masked upload → private-mode inference → facets and real request ID. | AI makes contributed context useful without requiring a public plaintext dataset. |

Do not describe Hissa as three unrelated sponsor integrations. Discovery and permissions belong to Arkiv, AI interpretation to 0G, and payment settlement to Hedera. Each solves a different requirement of the same marketplace.

## 2. PDF 1 — Project details

### Project name

**Paste:** Hissa

### Category

**Select:** Artificial Intelligence.

### Emoji

**Select:** 💰 — keep the existing choice; earning a share is the human hook.

### Demonstration URL

**Paste:** https://hissa.tech

### Short description — maximum 100 characters

**Paste:**

Your conversations. Your consent. Your share of the AI economy.

### Description — minimum 280 characters

**Paste:**

Your conversations reveal what you want, which products you compare, and why you abandon a purchase. That context is valuable to businesses and AI systems. Hissa gives the person behind it a way to decide what can be used and earn a share of the value.

Hissa is a consent-based marketplace for human context. A contributor imports a supported ChatGPT or Claude export, reviews their own messages after on-device masking, and publishes an encrypted listing with explicit permissions and an expiry. A business's buyer agent can discover available listings and purchase permitted records through an HTTP payment flow. The seller can change permissions or revoke future availability, while receipts make marketplace activity and earnings visible.

Businesses can buy an aggregate report to answer questions such as “Why do customers abandon this product category?” or separately purchase explicitly permitted masked records. The integrated prototype uses Arkiv listings and consent state, 0G private-mode inference, and autonomous x402 payments on Hedera testnet. The insight demo mixes real consenting listings with a clearly labelled synthetic seed panel; it is not a claim of fifty real users. HCS provides a spending audit trail, and Hedera Schedule Service supports seller payouts without Solidity contracts.

Hissa means “share” in Hindi. Our goal is simple: as agents become buyers of human context, the people creating that context should have a say in the transaction and a share in its value.

### How it's made — minimum 280 characters

**Paste:**

Hissa uses a React and TypeScript frontend built with Vite, a Node.js/Hono API, and three infrastructure components with distinct responsibilities.

The browser parses supported ChatGPT and Claude exports, keeps user-authored messages, runs an on-device NER model plus rules to mask names, places, emails, phone numbers and IDs, and lets the contributor review the result. Records are encrypted before publication. Public catalogue tags support discovery; record contents and seller details are stored as encrypted payloads rather than plaintext attributes.

Arkiv on Rabdi is the marketplace's application database. We use @arkiv-network/sdk and viem to publish and query typed entities, update consent, handle listing expiry and deletion, and persist activity and payment receipts. Seller control requests are signed with a per-listing key; the platform writer submits the corresponding Arkiv operation. The earnings view derives its state from persisted receipts.

For AI analysis, our 0G Router client requests private-mode providers and TEE verification. It extracts structured facets from masked uploads and implements an integrated insight pipeline over consenting Arkiv listings plus a labelled synthetic seed panel: label excerpts, group themes, bound each person's contribution, add statistical noise, and write a report from the aggregate shares. The client captures request IDs and verification metadata and rejects an explicitly failed TEE verification response.

For commerce, @x402/hono protects paid endpoints and @x402/fetch lets the buyer client pay and retry. Blocky402 settles HBAR on Hedera testnet. Per-purchase, run-budget and daily spending checks run before signing. The CLI payment lane independently checks settlements through the Mirror Node; the hosted API submits HCS audit messages in the background. These demo controls are not yet hardened for concurrent requests or lost settlement responses. The app uses Hedera Schedule Service for seller transfers and credits 80% of record purchases to seller earnings. A scheduled 1.2 HBAR seller payout has been independently confirmed as executed on testnet.

One useful engineering detail is the bridge between chains: Hedera payment results become Arkiv marketplace receipts, so purchases can feed the same history and earnings view as listing activity. A local settlement outbox retains pending receipt work across restarts. This is a single-seller testnet prototype. Paid insights use live consenting Arkiv listings together with a labelled synthetic seed cohort; only the real contributors’ proportional share is credited for payout. Hosted-agent authorization and reliable spending/accounting recovery remain hardening work.

### GitHub repository

**Use:** https://github.com/Unchanted/Hissa

The old remote name, `ethglobalmumbai26`, resolves to this public repository. Select the current repository in the submission picker.

## 3. PDF 2 — Tech stack and missing dropdown options

The PDFs show the closed dropdowns, not their full option lists. They do establish that **Other technologies accepts custom text**: type a value and press Enter. Put missing tools there. A technology tag is distinct from the explicit partner-prize selection in PDF 3.

| Form field | Recommended entry |
| --- | --- |
| Ethereum developer tools | **viem**, if offered. Otherwise use **Other** or **None / not applicable**, according to the available choices, and name the real tools below. |
| Blockchain networks | **Hedera**. Add **Arkiv / Rabdi** if offered; otherwise name Rabdi in Other technologies. For the existing **0G** selection, clarify below that our use is Private Computer inference, not a custom deployment on 0G Chain. |
| Programming languages | **TypeScript, JavaScript, HTML/CSS**. |
| Web frameworks | **React.js**; **Hono** and **Vite** if offered, otherwise add them below. |
| Databases | **Arkiv** if offered. Otherwise **Other**, or **None of the listed options** if available, then explicitly add Arkiv below. Do not select a database we do not use. |
| Design tools | Select only tools actually used. If no separate design tool was used, choose the available None / not applicable option. Code-built UI does not imply Figma usage. |

Do not select Hardhat, Foundry, Solidity, IPFS, The Graph, MetaMask, Postgres or MongoDB merely to make the submission look more Web3. The repo already contains substantive Web3 work through SDKs and native services. If a required dropdown offers no truthful answer, the screenshots do not establish a workaround; ask event support about that specific field.

### Other technologies — enter these as separate tags

- Arkiv (Rabdi DB-Chain)
- @arkiv-network/sdk
- viem
- 0G Private Computer
- x402
- Blocky402
- Hedera Consensus Service (HCS)
- Hedera Scheduled Transactions
- @hiero-ledger/sdk
- Web Crypto API
- Hono
- Vite

### Optional stack clarification, where free text is available

**Paste:**

Arkiv on Rabdi is our application database and the network used for listing and consent state. Hedera testnet settles x402 payments and supplies HCS payment logs and scheduled transfers. We use 0G through its Private Computer inference API; we are not claiming a custom contract deployment on 0G Chain.

### How AI tools were used

**Paste:**

We used Claude Code and OpenAI Codex as development assistants for research, implementation, debugging, and validation across the frontend, server APIs, and Arkiv, Hedera, and 0G integrations. Their work included code generation and iteration on the marketplace flows, integration probes, and tests. Separately, the product itself integrates 0G Private Computer for analysis of masked text and paid insight reports over real consenting listings plus a labelled synthetic seed panel. AI-assisted development and runtime product inference are distinct uses of AI.

Team check: Claude Code and Codex are confirmed; edit the task breakdown if any listed activity does not reflect the team's actual use. Do not copy the PDF's placeholder about implementing Solidity contracts.

## 4. PDF 3 — Track and prizes

**Recommended selection:** Building from Scratch, provided Hissa's submission work began within the event's permitted window. The repository documents an earlier, different idea, Preflight, followed by a cleared-repository pivot to Hissa. Explain that history if asked; do not claim the repository itself had no prior history.

**Submission type:** Top 10 Finalist & Partner Prizes.

**Partners:** Hedera, Arkiv, 0G. These use the three allowed partner slots. Mumbai explicitly permits eligibility for multiple tracks under one partner while counting that partner as one prize selection. Target **both Hedera x402 and No Solidity Allowed** within the single Hedera slot; individual qualification requirements still apply and multiple awards are not guaranteed. The $15,000 labels are each partner's total pool, not the value of our target prize.

**Other partners used:** Leave empty unless the team actually used another listed partner. Installed libraries are not extra sponsor integrations.

### Hedera — target both x402 and No Solidity Allowed

**Primary:** AI Agents That Pay: x402 on Hedera ($6,500 pool).

**Secondary:** No Solidity Allowed: Build with Hedera SDKs ($2,000 pool).

**How are you using this Protocol / API? — Paste:**

Hissa uses Hedera for autonomous agent commerce and contributor payouts. A buyer agent discovers permitted human-context records and buys records or insight reports through x402, paying HBAR on Hedera testnet through Blocky402 without a human approving each payment. The client checks per-purchase, task-budget and daily spending limits before signing. Our CLI demo independently confirms payments through the Mirror Node, and HCS records a verifiable spending trail; the hosted API currently submits those messages on a best-effort basis.

We are targeting both “AI Agents That Pay: x402 on Hedera” and “No Solidity Allowed: Build with Hedera SDKs.” We use @hiero-ledger/sdk with two native services: Hedera Consensus Service for audit messages and Hedera Schedule Service for seller payouts. We wrote no Solidity contracts. Three saved x402 purchases totaling 6 HBAR and their matching HCS messages are publicly verifiable, and schedule 0.0.11344252 executed a 1.2 HBAR seller payout. Arkiv receipts connect settled payments to contributor earnings. This is a single-seller testnet prototype; authorization, concurrent spending enforcement and recovery remain hardening work.

**Link to code — Paste:**

https://github.com/Unchanted/Hissa/blob/f20d11f/apps/server/src/api.ts#L224

**Supporting code:**

- x402 resource server: https://github.com/Unchanted/Hissa/blob/f20d11f/packages/pay/src/paywall.ts#L29
- Autonomous signer and spending checks: https://github.com/Unchanted/Hissa/blob/f20d11f/packages/pay/src/payer.ts#L49
- Native HCS messages: https://github.com/Unchanted/Hissa/blob/f20d11f/packages/pay/src/hcs.ts#L22
- Native HSS seller payout: https://github.com/Unchanted/Hissa/blob/f20d11f/apps/server/src/api.ts#L346

**Suggested ease rating:** 8/10, subject to the team's own assessment.

**Additional feedback — Paste:**

The TypeScript SDK and x402 integration let us connect a paid HTTP request to native HBAR settlement, HCS audit messages and HSS contributor payouts without Solidity. A single reference example covering facilitator fee-payer IDs, Mirror Node confirmation, durable HCS retries, signer-level budget reservations and recovery after uncertain settlement would make the full commerce flow easier to implement safely.

**Judge opening:** “An agent should be able to buy permitted human context as naturally as it calls an API. Hissa demonstrates an autonomous HBAR payment, an HCS spending trail, and a native scheduled payout to the contributor — all without Solidity.”

**Proof to show for x402:**

- Settled payment, 2 HBAR: https://hashscan.io/testnet/transaction/0.0.7162784-1793985302-813252518
- Settled payment, 1 HBAR: https://hashscan.io/testnet/transaction/0.0.7162784-1793985304-420859908
- Settled payment, 3 HBAR: https://hashscan.io/testnet/transaction/0.0.7162784-1793985310-661395447
- Agent account: https://hashscan.io/testnet/account/0.0.11342909
- HCS topic, matching messages 1–3: https://hashscan.io/testnet/topic/0.0.11342910
- Saved fixture run: https://github.com/Unchanted/Hissa/blob/f20d11f/evidence/hedera-agent-run.json

**Proof to show for No Solidity Allowed:**

- Native service 1: HCS topic and messages linked above.
- Native service 2: https://hashscan.io/testnet/schedule/0.0.11344252
- The schedule's executed transaction succeeded at consensus timestamp `1793991908.037408105`, transferring **1.2 HBAR** from treasury `0.0.10453173` to seller `0.0.10502605`.
- Use the JavaScript SDK code links above to connect the demo to HCS and HSS usage.

**Team notes — do not paste as product claims:**

The saved three-payment run used the fixture server. Its 2/1/3 HBAR prices differ from the current integrated API's 1 HBAR record and 2 HBAR report prices. The current web API reads real Arkiv listings and supports paid 0G reports with a labelled synthetic seed panel. Do not point the older CLI at the live API and assume its listing shape and fixed analysis IDs still match.

The `0.0.7162784` transaction prefix is Blocky402's network fee payer, not the source of the purchase funds. HCS delivery is currently best effort. Scheduled payout execution is proven; recurring subscriptions and daily automatic scheduling are not. Do not claim HTS, ATS, Stablecoin Studio, Agent Kit, ERC-8004, HCS-14 or multi-agent negotiation.

Known review findings and recommended fixes: [Hedera/x402 review](hedera-x402-review-2026-11-07.md). The current hosted API lacks funded-agent authorization, payment attribution trusts client resource metadata, and budget accounting needs concurrency and uncertain-settlement protection. Do not describe these controls as production-ready.

### Arkiv — primary target: Build on Arkiv (from scratch)

**How are you using this Protocol / API? — Paste:**

Arkiv is Hissa's application database: encrypted listings, queryable public tags, consent state, and activity/payment receipts live as Rabdi entities read by the marketplace and earnings views. We use typed SDK queries, signed seller control requests, platform-owned entity mutations, and expiry to connect the catalogue's current availability to the contributor's choices.

**Link to code:**

https://github.com/Unchanted/Hissa/blob/f20d11f/packages/arkiv/src/app-store.ts#L40

**Suggested ease rating:** 7/10, subject to the team's own assessment.

**Additional feedback — Paste:**

Typed entities and indexed filters map well to a consent-based catalogue. Clearer guidance on expiry versus historical data retention, receipt renewal, and recovery after uncertain writes would help applications avoid treating entity disappearance as secure erasure or assuming audit records last forever.

**Judge opening:** “A buyer needs to know what is available now, and a contributor needs future use to follow their permission. We model that shared catalogue and its lifecycle directly in Arkiv.”

**Why Arkiv rather than Postgres:** A private database can reproduce the application's screens. What it does not provide by itself is a publicly queryable catalogue with chain-enforced entity ownership, lifecycle and independently readable receipts. Arkiv gives other clients a shared public substrate for discovery and inspection. Hissa still trusts its service to decrypt records and enforce release decisions; Arkiv does not enforce every off-chain consent rule.

**Proof to show:**

- Historical encrypted publication: https://rabdi.explorer.arkiv.network/tx/0x7b47e50e5ce94848e22489a4d4ce1b2626147463df384376cbac226e4155cf8c
- Historical consent change: https://rabdi.explorer.arkiv.network/tx/0xffd3191aecef0b4be672bed19818834375287ec97c7a1d94c5001b2fbd1cd35d
- Probe writer: `0x0F58223AAfF9C6e2534aaD09a996048175C04C96`.
- Live-test findings: https://github.com/Unchanted/Hissa/blob/f20d11f/docs/arkiv-test-findings-2026-11-06.md

The historical probe entities were deliberately deleted or allowed to expire. For judging, publish a fresh synthetic listing and demonstrate its reads and consent change. Confirm and document the running app's writer separately from the historical probe writer.

**Qualification files now present on main:** `/arkiv/reach.md`, `/arkiv/why-arkiv.md`, `/arkiv/how-you-use-arkiv.md`, `/arkiv/schema.md`, `/arkiv/friction.md`, an MIT license, and a README section with the application writer and a runnable read-only query (`node packages/arkiv/scripts/query-listings.mjs`). Review the final content rather than recreate these files. Reach should identify intended users and availability honestly; do not invent adoption or a post-event commitment.

### 0G — primary target: Build with 0G Private Computer

**How are you using this Protocol / API? — Paste:**

Hissa integrates 0G Private Computer to turn masked conversations into structured facets and paid aggregate research reports over consenting Arkiv listings plus a labelled synthetic seed panel, using private-mode inference requests that capture request IDs and verification metadata. Without 0G, these AI-generated facets and reports are unavailable: it is our analysis engine, while basic listing publication can still operate with local masking.

**Link to code:**

https://github.com/Unchanted/Hissa/blob/f20d11f/packages/ai/src/zerog.ts#L88

**Suggested ease rating:** 7/10, subject to the team’s own experience with the authenticated runs.

**Additional feedback — Paste:**

The OpenAI-compatible API makes integration approachable. A minimal sealed-inference example that clearly distinguishes requesting verification, receiving verification metadata, and independently verifying a response would help, especially alongside documented behavior for unavailable private providers, exhausted credits, and missing trace fields.

**Judge opening:** “The useful product is an answer to why people choose or abandon something. 0G turns masked, unstructured context into those signals; the marketplace gives that analysis a consent and payment path.”

**Reason to return:** Contributors can review activity and earnings; the intended repeat use for businesses is refreshing insights as new consented context arrives. This repeat-use opportunity is not demonstrated traction. The current report flow includes a labelled synthetic seed panel and does not establish a cohort of fifty real users.

**Evidence gate:** The older `0g-probe.json` is not the latest inference evidence. `evidence/0g-compare-glm-5.3.json` and `evidence/0g-compare-0gm-1.0-35b-a3b.json` contain authenticated model/job runs, request IDs and receipts. Check each actual receipt: some verification values are missing or false, and a private-mode request or `e2ee: sealed` header does not independently prove successful attestation. The current client rejects explicitly false verification but permits missing metadata. Demonstrate real request IDs, disclose unavailable verification and do not label all evidence as verified. No iAI sign-in or self-funding inference loop is established here.

## 5. Finalist presentation — approximately 60 seconds

Your conversations reveal what you want, which products you compare, and why you walk away. That context is valuable. But the person creating it has no simple way to license it and earn a share.

We're building Hissa — “share” in Hindi — a marketplace connecting human permission to agent demand.

A contributor reviews their own chat messages, masks personal details, and publishes an encrypted listing with permissions and an expiry. A buyer agent discovers available records and pays through an HTTP request. Receipts connect that purchase to seller earnings, and the contributor can revoke future availability.

Arkiv holds the catalogue and consent state. Hedera settles the agent's payment. 0G powers our AI interpretation layer and paid aggregate reports using consenting listings plus a labelled synthetic seed panel. HCS logs spending, and Hedera Schedule Service pays the seller, without Solidity.

The goal is bigger than selling individual records: useful answers for businesses, with permission and a share for the people whose context made those answers possible.

As agents become buyers, people should become participants in the value their data creates.

## 6. Shared demo video — target 2 minutes 50 seconds

Use one recording that meets the strictest partner limit: 0G requires **under 3 minutes**. The supplied general form says no more than 4 minutes; Hedera allows up to 5. Do not speed up the recording.

| Time | Show | What the viewer should understand |
| --- | --- | --- |
| 0:00–0:20 | Human problem and Hissa name. | Context has value; its creator should have permission and participation. |
| 0:20–0:55 | Supported export, own-message review, masking, real 0G upload analysis and request ID. | The contributor sees what they are choosing to provide. Only call verification successful if the receipt establishes it. |
| 0:55–1:25 | Publish an encrypted listing; open its Arkiv transaction and query result. | Public discovery does not require publishing plaintext records. |
| 1:25–2:00 | Agent discovers and buys; show the quote, settlement and HashScan/HCS evidence. | The agent completes the payment without an approval click for that purchase. |
| 2:00–2:25 | Earnings/receipt view; open the executed HSS seller payout, then disable sale permission and show rejection. | HCS + HSS establish the second Hedera track; the contributor earns a share and controls future availability. |
| 2:25–2:40 | Paid aggregate report with real 0G IDs and real/seed counts clearly labelled. | The report combines permitted Arkiv inputs with synthetic demo participants; do not imply fifty real users. |
| 2:40–2:50 | Demo URL and closing promise. | Human permission and participation in the agent economy. |

Only use this sequence after rehearsal. If a live inference fails, fix or disclose that state; a simulated report is not a substitute for 0G's required evidence.

## 7. Before pressing Submit

1. Open `https://hissa.tech` from another device and rehearse the submitted flow against `https://api.hissa.tech`. API health, a real 402 challenge and public receipts were checked during the Hedera review; that is not a substitute for a browser rehearsal.
2. Submit the final default branch and check all source links. The implementation links pin public commit `f20d11f`; replace them only if relevant code changes again.
3. Select **Hedera, Arkiv and 0G**. In Hedera's answer explicitly name **both x402 and No Solidity Allowed**; they count as one partner slot. Confirm the event-window history supports Building from Scratch. Arkiv qualification docs, MIT license, writer details and read-only query are now on main.
4. Show an actual 0G request ID and inspect its receipt. Private-mode/sealed metadata alone is not proof of independently verified attestation; keep the synthetic panel visible.
5. Rehearse one fresh listing → autonomous payment → Arkiv receipt → earnings flow. Show HCS and executed schedule `0.0.11344252` for the second Hedera track. Historical fixture settlements and payouts are supporting evidence, not a fresh integrated rehearsal. Show a budget refusal without charging.
6. Upload screenshots and the final video, add its public URL, supply team contacts and finish the submission. The final video and successful submission have not been verified. Known payment-hardening gaps are recorded in [the review](hedera-x402-review-2026-11-07.md).

### Claims to keep precise in answers and Q&A

- Say **“revoke future access”**, not “erase data from the blockchain” or “recall already delivered records.”
- Say **“encrypted at rest; the service holds decryption capability”**, not “the platform can never read it.”
- Say **“on-device masking plus contributor review”**, not “all identifiers removed.”
- Say **“masked record”** for an individual sale. Statistical noise and a cohort threshold do not establish a formal anonymity or differential-privacy guarantee for this whole pipeline.
- Say **“testnet payments”**, not revenue, paying customers or production traction.
- The contact endpoint currently returns a delivery acknowledgement without a demonstrated Telegram relay. Leave contact delivery out of the pitch.
- Paid aggregate insights now use consenting Arkiv listings plus a synthetic seed panel. Describe the real/seed split accurately; this remains a single-seller prototype, not a proven multi-seller payout system.
- Describe spending checks as implemented demo controls, not a guarantee against concurrent overspending or lost responses. HCS messages are best effort in the hosted API.
- Claim HCS and HSS as the two native services for the SDK track; do not call a scheduled payout a recurring subscription.

## 8. Source references

- Supplied `ETHGlobal Mumbai.pdf`: project details, 100-character short description, 280-character minimum long fields, general video limit.
- Supplied `ETHGlobal Mumbai2.pdf`: stack fields and explicit custom-entry Other technologies field.
- Supplied `ETHGlobal Mumbai3.pdf`: finalist/partner selection, three-partner maximum, sponsor answer/code/rating/feedback fields.
- [Arkiv prize requirements](https://ethglobal.com/events/mumbai/prizes/arkiv): target track, qualification files, license and README requirements.
- [0G prize requirements](https://ethglobal.com/events/mumbai/prizes/0g): inference evidence, usable demo, return-use case, under-three-minute video.
- [Hedera prize requirements](https://ethglobal.com/events/mumbai/prizes/hedera): autonomous x402 settlement, transaction evidence, HCS and other native-service opportunities.
- Local implementation: `apps/web/src/views/Seller.tsx`, `apps/web/src/views/Agent.tsx`, `apps/server/src/api.ts`, `packages/arkiv/src/app-store.ts`, `packages/ai/src/zerog.ts`, `packages/ai/src/insights.ts`, `packages/pay/src/paywall.ts`, `packages/pay/src/payer.ts`.
- Saved evidence: `evidence/hedera-agent-run.json`, `evidence/arkiv-roundtrip.json`, `evidence/arkiv-lifecycle.json`, `evidence/0g-probe.json`.

- [Mumbai submission rules](https://ethglobal.com/events/mumbai/info/details): multiple tracks under one partner count as one prize selection.
- [Hedera/x402 review and verified payout evidence](hedera-x402-review-2026-11-07.md).
