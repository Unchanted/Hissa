# Hissa: Hedera and x402 implementation review

Reviewed on 7 November 2026. Repository baseline: `7307706a5d81386bff5b6e2efd2981432fda3144`, after pulling the latest `origin/main`.

## Recommendation

**Prioritize “AI Agents That Pay: x402 on Hedera” and also present eligibility for “No Solidity Allowed: Build with Hedera SDKs.”** Hissa has real HBAR settlements, a payment audit topic on HCS, and an executed payout through Hedera Schedule Service. The integration is substantive, but the hosted agent's authorization, payment attribution and budget accounting need fixes.

This is an implementation and submission-readiness assessment, not an eligibility decision by the organizers or a prediction of winning. No application fixes were made during this review.

## Prize and problem-statement fit

| Track | Assessment | Evidence or missing requirement |
| --- | --- | --- |
| AI Agents That Pay: x402 on Hedera ($6,500) | Strongest fit; technical requirements supported | Paid data/insight endpoints, autonomous x402 payer, documented Blocky402 settlements, public repository and transaction IDs. Final demo video not verified. |
| No Solidity Allowed: Build with Hedera SDKs ($2,000) | Strong secondary technical fit | JavaScript SDK, HCS payment messages and HSS scheduled payouts; no Solidity contracts found. |
| Tokenize Anything with Hedera Studios ($5,000) | Does not currently fit | No ATS or Stablecoin Studio integration. |
| Built on Hedera: Continuity Track ($1,500) | Not established | Requires Continuity participation and substantive event work on a pre-existing Hedera project. Current README describes a project built from scratch. |

Sources: [Hedera prize requirements](https://ethglobal.com/events/mumbai/prizes/hedera), [Mumbai submission rules](https://ethglobal.com/events/mumbai/info/details).

Mumbai permits multiple tracks from one partner to count as one partner-prize selection. Select Hedera and explain both relevant tracks; eligibility for both does not guarantee multiple awards.

Hissa fits the x402 problem statement as a data marketplace where an agent discovers permitted records, pays per request and records its spending. A user can initiate the task while the payment itself completes without separate human approval. Keep the distinction between the fixed-brief CLI demo and the current API-backed web flow explicit.

## Verified implementation and network evidence

### Payment flow

1. Discover available listings without payment.
2. Request a protected record or report and receive HTTP 402 with `PAYMENT-REQUIRED`.
3. Check spending limits and sign a Hedera HBAR transfer automatically.
4. Retry with `PAYMENT-SIGNATURE`; Blocky402 verifies and settles the transfer.
5. Release the successful response with `PAYMENT-RESPONSE` and record the settlement.
6. Submit a payment message to HCS; the hosted API currently does this on a best-effort basis.

The installed Hono x402 middleware runs the handler after verification, buffers its successful response, then settles before releasing that response. A failed handler therefore normally avoids settlement. The project uses HBAR asset `0.0.0`, tinybar amounts and `hedera:testnet`, consistent with the [Hedera exact scheme](https://docs.hedera.com/solutions/ai/x402/exact-scheme). Blocky402 is a [documented facilitator](https://docs.hedera.com/solutions/ai/x402/facilitators); this repository does not implement its own facilitator.

### Read-only live checks

These checks were performed during this review session, before pulling the documentation/UI updates. The pull did not change the payment implementation. No new paid requests or blockchain writes were submitted by the review.

- `https://api.hissa.tech/health` returned HTTP 200 with Hedera testnet and the expected account/topic IDs.
- An unsigned request for a live record returned HTTP 402. Its challenge quoted `100000000` tinybars (1 HBAR), treasury `0.0.10453173`, asset `0.0.0`, and fee payer `0.0.7162784`.
- Blocky402 `/supported` advertised the Hedera testnet exact scheme and the same fee payer.
- GitHub's public API confirmed the repository is public and resolves to [Unchanted/Hissa](https://github.com/Unchanted/Hissa).
- The public receipts API contained paid-report receipts as well as listing activity. This supports current API integration separately from the older fixture-run artifact.

All three payments in [the saved agent run](../evidence/hedera-agent-run.json) were independently confirmed on Hedera's public mirror node:

| Product in saved fixture run | HBAR | Transaction | HCS sequence |
| --- | ---: | --- | ---: |
| Record `lst_7f3a` | 2 | [0.0.7162784@1793985302.813252518](https://hashscan.io/testnet/transaction/0.0.7162784-1793985302-813252518) | 1 |
| Record `lst_91c2` | 1 | [0.0.7162784@1793985304.420859908](https://hashscan.io/testnet/transaction/0.0.7162784-1793985304-420859908) | 2 |
| Insight `abandonment-drivers` | 3 | [0.0.7162784@1793985310.661395447](https://hashscan.io/testnet/transaction/0.0.7162784-1793985310-661395447) | 3 |

Each transaction had `SUCCESS`, debited agent `0.0.11342909`, credited treasury `0.0.10453173`, and charged the network fee to Blocky402. These historical prices are not the current integrated API's prices.

The first three messages in [HCS topic 0.0.11342910](https://hashscan.io/testnet/topic/0.0.11342910) contain matching payment IDs and amounts. The topic has an agent submit key and treasury admin key; the admin can change topic controls.

[Schedule 0.0.11344252](https://hashscan.io/testnet/schedule/0.0.11344252) executed at consensus timestamp `1793991908.037408105`. Its scheduled `CRYPTOTRANSFER` succeeded, sending 1.2 HBAR from treasury `0.0.10453173` to seller `0.0.10502605`. This establishes actual HSS use alongside HCS for the SDK track. It does not establish recurring subscriptions or a daily payout scheduler.

## Findings and recommended fixes

### 1. High: hosted agent operations lack authorization

**Evidence:** [Origin middleware and agent endpoints](../apps/server/src/api.ts), lines 138–143 and 298–344.

Requests without an `Origin` header pass the origin check. The funded `/agent/buy`, `/agent/contact` and `/agent/insight` routes have no authentication or authorization. A direct HTTP client can invoke the server-held signer. The caller also supplies `budgetLeftHbar`, so the purported run budget is not a server-owned cross-request invariant.

**Impact:** Unauthorized use of testnet funds, paid compute and access to purchased data through the shared agent. CORS does not protect the signing authority.

**Fix:** Authorize access to funded agent operations and own budget state on the server. Preserve autonomous payment after the task has been authorized. Validate request fields before signing.

**Proof to add:** Unauthenticated requests cannot reach signing; authorized tasks cannot reset their remaining budget by changing the request body.

### 2. High: unsigned payment metadata controls seller earnings

**Evidence:** [Settlement callback](../packages/pay/src/paywall.ts), line 45; [receipt attribution](../apps/server/src/api.ts), lines 232–240.

The callback identifies the product, listing and contributor share from `paymentPayload.resource.url`. In the installed x402 implementation, matching payment requirements does not bind this URL to the actual HTTP route; the Hedera signature signs the transfer. A valid record payment can carry an insight resource URL, leading to incorrect classification and potentially a zero seller share. An absent or malformed resource can also prevent receipt creation. The installed core catches after-settlement callback errors, so successful settlement does not guarantee successful persistence.

**Impact:** Payment can settle and content can be delivered while contributor accounting is wrong or missing. The existing outbox cannot recover an event that was never successfully stored.

**Fix:** Derive purchase attribution from the actual server request and matched route, rather than client-provided resource metadata. Persist the correct settlement event durably.

**Proof to add:** Altered, missing and query-suffixed payload URLs cannot change product attribution, seller share or receipt creation.

### 3. High: concurrent purchases can exceed spending caps

**Evidence:** [Agent payer](../packages/pay/src/payer.ts), lines 69–81 and 93–105; per-request payer creation in [the API](../apps/server/src/api.ts), lines 264–270 and 328.

Daily spending is checked before signing and updated only after the HTTP response. Concurrent requests can read the same remaining allowance and all pass. Each API request creates its own payer. Concurrent calls on a single payer also share mutable `quoted` state. Ledger read/parse errors silently become zero spent.

**Impact:** The existing controls work for the sequential happy path but are not a reliable concurrent or failure-safe spending boundary.

**Fix:** Serialize purchases for the signer and reserve spending durably before signing. Reconcile uncertain reservations, and fail closed on unreadable spending state.

**Proof to add:** Concurrent requests cannot exceed the remaining daily/task cap; corrupted state cannot reset the cap.

### 4. Medium: uncertain settlements can disappear from budget accounting

**Evidence:** [Agent payer](../packages/pay/src/payer.ts), lines 95–104.

An HTTP error or lost response throws before local spending is updated, even if the network payment settled. An offline review reproduction supplied a successful settlement header with HTTP 503 and observed no budget debit. This was a synthetic response test, not a live facilitator failure reproduction.

**Impact:** A retry can create another payment under an unchanged budget.

**Fix:** Process explicit settlement evidence before rejecting a response, and retain enough signed-transaction information to reconcile network uncertainty before releasing reserved funds or retrying.

**Proof to add:** A settled payment remains counted after response failure; an uncertain payment cannot be blindly charged again.

### 5. Medium: HCS audit delivery is best effort

**Evidence:** [Background HCS logger](../apps/server/src/api.ts), lines 113–119.

Failures only produce a console warning. There is no durable HCS retry queue, and a process exit can lose an outstanding submission. The README's statement that every payment is logged is stronger than the implementation guarantees.

**Fix:** Record HCS work durably and retry/reconcile submissions, or explicitly describe the current delivery guarantee as best effort. Awaiting a submission alone does not provide crash recovery.

**Proof to add:** A failed submission survives restart and eventually obtains a recorded HCS sequence without silently losing the event.

### 6. Submission clarity: distinguish fixture and integrated demos

**Evidence:** [README Hedera section](../README.md), [CLI agent](../apps/agent/src/index.ts), and [integrated API](../apps/server/src/api.ts).

The README Hedera section documents `hedera:server` and its fixture run. The newer Arkiv section now explains the live integrated API, funded runs, synthetic cohort and deployment more accurately. These latest changes improve documentation but do not change the payment findings above.

The CLI expects listing fields `consent_sale`, `price` and `listing_id`; the live listing API returns a different shape. Its fixed insight IDs also differ from the current API's dynamically created jobs. Do not imply that pointing the CLI at the live API reproduces the historical run unchanged.

**Fix:** Label the two command paths explicitly, identify which evidence belongs to each, and provide a reproducible current demo. Keep the synthetic cohort and simulated Telegram labels visible.

## Existing protections worth keeping

- HBAR amounts in payment requirements use integer tinybars and explicit network/asset configuration.
- Consent and listing checks run before issuing a payment challenge.
- The paywall uses the installed exact-scheme implementation and external facilitator rather than a custom transfer parser.
- Successful handler output is withheld until settlement succeeds.
- Settlement outbox entries survive restart once remembered; payment receipts are idempotent.
- Payout reservations persist before the external transfer, preventing a second payout after uncertainty. An unresolved reservation requires reconciliation rather than blind retry.
- The project uses a separate agent account, treasury and HCS topic submit key.

These protections do not resolve the authorization, metadata attribution or spending-accounting findings.

## Submission checklist

- Select Hedera; lead with x402 and explicitly mention the HCS + HSS SDK-track fit.
- Show discovery, the 402 quote, automatic signed retry, settlement, HashScan and a matching HCS message.
- Show a scheduled seller payout and its executed transfer, not just schedule creation.
- Show a rejected over-budget request without spending funds.
- Include a settled transaction ID, setup instructions, architecture and the payment flow in the public README.
- Verify the final video and its public link. Hedera permits up to five minutes, while the Mumbai upload guide requires two to four minutes; the existing roughly three-minute script fits both.
- Do not claim HTS token settlement, ATS, Stablecoin Studio, Agent Kit, HCS-14/ERC-8004, multi-agent negotiation or recurring subscriptions without implementing and demonstrating them.
- Do not add optional integrations solely for prize checkboxes before fixing payment correctness and completing the demo.

## Diagnostic scorecard

This provisional score uses the installed Hedera submission-validator skill's rubric. It is not the published Mumbai judging formula, a competition score or winning odds. UI usability, the final video and external user feedback were not fully assessed.

| Criterion | Score | Weight | Evidence or limitation |
| --- | ---: | ---: | --- |
| Innovation | 4/5 | 10% | Differentiated consented-data marketplace and autonomous purchase flow; ecosystem-wide novelty not proven. |
| Feasibility | 3/5 | 10% | Working payment mechanics; single-seller demo and limited market evidence. |
| Execution | 3/5 | 20% | Live integration and recovery primitives; material correctness gaps remain. |
| Integration | 4/5 | 15% | Real HBAR transfers, HCS, HSS and mirror-node usage. |
| Validation | 1/5 | 15% | No external-user validation established by this review. |
| Network impact | 3/5 | 20% | Meaningful per-use network activity, but limited demonstrated adoption. |
| Pitch | 3/5 | 10% | Clear core story; distinguish demos and substantiate guarantees. |

Weighted diagnostic result: 59%. The most useful improvements are payment correctness, reliable evidence and a clear demo, rather than additional services.

## Verification and limits

- Six targeted accounting/outbox tests passed: `node --test packages/arkiv/test/app-store.test.mjs packages/arkiv/test/settlement-outbox.test.mjs`.
- `npm run typecheck` failed in the reviewed local environment with three `apps/web/src/ner.worker.ts` errors: unresolved `@huggingface/transformers`, implicit `any` for `pipe`, and a nullable promise return. This does not by itself establish a clean-install failure.
- The latest pull changed documentation/UI and added an Arkiv query script; the cited payment paths remained unchanged. Targeted checks were repeated after the pull when preparing this report.
- No dedicated Hedera payment/HCS/schedule test suite was found in the reviewed paths.
- No new funded end-to-end run, malicious live payment, external-facilitator replay test or settlement-recovery drill was performed.
- Live network evidence establishes past transfers and messages; it does not prove all future requests are safe or that the final submitted video demonstrates the required flow.
- The final video, participant registration, final submission and judge eligibility decisions remain unverified.

Review used the Hedera x402, consensus-service and submission-validator skills, with independent read-only payment review. Existing unrelated workspace changes were preserved.
