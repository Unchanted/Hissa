/**
 * Demo API behind apps/web, with real Hedera testnet money movement:
 *
 *   buyer agent ──x402──▶ treasury            (record 1 ℏ, Telegram message 0.5 ℏ)
 *   treasury ──scheduled transfer──▶ seller   (80% of what the seller earned)
 *
 * The agent's key stays on this server; the browser only asks it to act. Listings
 * live in memory here until the Arkiv lane replaces them, and consent is checked
 * before any payment is requested. Run from the repo root: `npm run demo:api`.
 *
 *   GET    /health                       mode + account IDs
 *   GET    /api/balances                 live balances from the mirror node
 *   POST   /api/listings                 register the seller's listing (consent flags)
 *   PATCH  /api/listings/:id             change consent
 *   DELETE /api/listings/:id             revoke
 *   GET    /api/records/:id      x402    one record
 *   POST   /api/contact/:id      x402    one Telegram message through the relay
 *   POST   /agent/buy                    agent buys a record (pays on its own)
 *   POST   /agent/contact                agent pays to message a seller
 *   POST   /api/payouts                  treasury pays the seller what they are owed
 *   GET    /api/receipts                 settled payments and payouts
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { AccountId, Hbar, HbarUnit, ScheduleCreateTransaction, TransferTransaction } from "@hiero-ledger/sdk";
import {
  MIRROR,
  clientFor,
  hashscan,
  hbarToTinybars,
  parseEcdsaKey,
  requireEnv,
  tinybarsToHbar,
} from "../../../packages/pay/src/hedera.js";
import { createPaywall } from "../../../packages/pay/src/paywall.js";
import { AgentPayer } from "../../../packages/pay/src/payer.js";
import { logPaymentToHcs, type AgentPaymentLog } from "../../../packages/pay/src/hcs.js";

const treasuryId = requireEnv("HEDERA_TREASURY_ID");
const treasuryKey = parseEcdsaKey(requireEnv("HEDERA_TREASURY_KEY"));
const agentId = requireEnv("AGENT_HEDERA_ACCOUNT_ID");
const agentKey = parseEcdsaKey(requireEnv("AGENT_HEDERA_PRIVATE_KEY"));
const topicId = requireEnv("HEDERA_PAYMENT_TOPIC_ID");
const sellerAccount = requireEnv("SELLER_HEDERA_ACCOUNT_ID");
const port = Number(process.env["PORT"] ?? 4021);
const self = `http://localhost:${port}`;

const RECORD_PRICE = hbarToTinybars(1);
const CONTACT_PRICE = hbarToTinybars(0.5);
const SELLER_SHARE_PCT = 80n;
const PER_PURCHASE = hbarToTinybars(Number(process.env["AGENT_MAX_PER_PURCHASE_HBAR"] ?? 5));
const DAILY = hbarToTinybars(Number(process.env["AGENT_DAILY_CAP_HBAR"] ?? 25));
/** Keep the agent funded between rehearsals: top up from the treasury below this. */
const AGENT_MIN_HBAR = 12;
const AGENT_TOPUP_TO_HBAR = 30;

const treasury = clientFor(treasuryId, treasuryKey);
const agentClient = clientFor(agentId, agentKey);

/* ---------- listings (in memory until the Arkiv lane is wired in) ---------- */

type Listing = { id: string; consentSale: boolean; consentContact: boolean; live: boolean; payoutAccount?: string };
const listings = new Map<string, Listing>(
  // Other synthetic sellers in the demo; they have no payout account here.
  ["lst_c04e", "lst_a19f", "lst_5d72"].map((id) => [id, { id, consentSale: true, consentContact: false, live: true }]),
);

/** Tinybars owed to each seller account, from settled sales and messages. */
const owed = new Map<string, bigint>();

type Receipt = { kind: string; listing?: string; txId: string; hashscan: string; amountHbar: string; at: string; hcsSeq?: string };
const receipts: Receipt[] = [];

/* ---------- helpers ---------- */

async function balanceOf(id: string): Promise<number> {
  const res = await fetch(`${MIRROR}/api/v1/balances?account.id=${id}`);
  const body = (await res.json()) as { balances?: { balance: number }[] };
  return (body.balances?.[0]?.balance ?? 0) / 1e8;
}

async function ensureAgentFunded() {
  const bal = await balanceOf(agentId);
  if (bal >= AGENT_MIN_HBAR) return console.log(`Agent ${agentId}: ${bal.toFixed(2)} HBAR`);
  const amount = Hbar.fromTinybars(Math.round((AGENT_TOPUP_TO_HBAR - bal) * 1e8));
  const tx = await new TransferTransaction()
    .addHbarTransfer(AccountId.fromString(treasuryId), amount.negated())
    .addHbarTransfer(AccountId.fromString(agentId), amount)
    .setTransactionMemo("hissa: top up demo agent")
    .execute(treasury);
  await tx.getReceipt(treasury);
  console.log(`Agent topped up by ${amount.to(HbarUnit.Hbar).toString()} HBAR  ${hashscan.tx(tx.transactionId.toString())}`);
}

function logHcsInBackground(entry: AgentPaymentLog, receipt: Receipt) {
  logPaymentToHcs(agentClient, topicId, entry)
    .then((r) => {
      receipt.hcsSeq = r.sequenceNumber;
      console.log(`  HCS ${topicId} #${r.sequenceNumber}`);
    })
    .catch((e) => console.warn(`  HCS log failed: ${(e as Error).message}`));
}

const errorStatus = (msg: string) => Number(/→ (\d{3})/.exec(msg)?.[1] ?? 502);
const errorText = (msg: string) => {
  const m = /"error":"([^"]+)"/.exec(msg);
  return m ? m[1]! : msg;
};

/* ---------- app ---------- */

const app = new Hono();
app.use("*", cors({ origin: "*", exposeHeaders: ["PAYMENT-REQUIRED", "PAYMENT-RESPONSE"] }));

app.get("/health", (c) =>
  c.json({ ok: true, network: "hedera:testnet", accounts: { treasury: treasuryId, agent: agentId, seller: sellerAccount, topic: topicId } }),
);

app.get("/api/balances", async (c) => {
  const [agent, seller, treasuryBal] = await Promise.all([balanceOf(agentId), balanceOf(sellerAccount), balanceOf(treasuryId)]);
  return c.json({ agent, seller, treasury: treasuryBal, owedToSeller: Number(tinybarsToHbar(owed.get(sellerAccount) ?? 0n)) });
});

app.post("/api/listings", async (c) => {
  const b = (await c.req.json()) as { listingId: string; consentSale: boolean; consentContact: boolean };
  if (!/^lst_[0-9a-z]{2,16}$/.test(b.listingId)) return c.json({ error: "bad listing id" }, 400);
  listings.set(b.listingId, { id: b.listingId, consentSale: !!b.consentSale, consentContact: !!b.consentContact, live: true, payoutAccount: sellerAccount });
  return c.json({ ok: true });
});

app.patch("/api/listings/:id", async (c) => {
  const l = listings.get(c.req.param("id"));
  if (!l) return c.json({ error: "listing not found" }, 404);
  const b = (await c.req.json()) as { consentSale?: boolean; consentContact?: boolean };
  if (typeof b.consentSale === "boolean") l.consentSale = b.consentSale;
  if (typeof b.consentContact === "boolean") l.consentContact = b.consentContact;
  return c.json({ ok: true, listing: l });
});

app.delete("/api/listings/:id", (c) => {
  const l = listings.get(c.req.param("id"));
  if (!l) return c.json({ error: "listing not found" }, 404);
  l.live = false;
  return c.json({ ok: true });
});

app.get("/api/receipts", (c) => c.json({ items: receipts }));

// Refuse before asking for money.
app.use("/api/records/:id", async (c, next) => {
  const l = listings.get(c.req.param("id"));
  if (!l || !l.live) return c.json({ error: "listing revoked or not found" }, 403);
  if (!l.consentSale) return c.json({ error: "consent_sale=false" }, 403);
  await next();
});
app.use("/api/contact/:id", async (c, next) => {
  const l = listings.get(c.req.param("id"));
  if (!l || !l.live) return c.json({ error: "listing revoked" }, 403);
  if (!l.consentContact) return c.json({ error: "consent_contact=false" }, 403);
  await next();
});

app.use(
  createPaywall({
    payTo: treasuryId,
    routes: {
      "GET /api/records/:id": { description: "One masked, watermarked data record", priceTinybars: RECORD_PRICE },
      "POST /api/contact/:id": { description: "One paid Telegram message to a seller, via the relay", priceTinybars: CONTACT_PRICE },
    },
    onSettled: (p) => {
      const id = p.resource.split("/").pop() ?? "";
      const l = listings.get(id);
      if (l?.payoutAccount) {
        const share = (BigInt(p.amountTinybars) * SELLER_SHARE_PCT) / 100n;
        owed.set(l.payoutAccount, (owed.get(l.payoutAccount) ?? 0n) + share);
      }
      console.log(`[x402] ${tinybarsToHbar(p.amountTinybars)} HBAR ${p.payer} → ${p.payTo} for ${id}  ${hashscan.tx(p.txId)}`);
    },
  }),
);

app.get("/api/records/:id", (c) => c.json({ record: { listing_id: c.req.param("id"), watermark: "buyer-scoped" } }));
app.post("/api/contact/:id", (c) => c.json({ delivered: true, via: "telegram-relay" }));

async function agentPays(kind: AgentPaymentLog["kind"], listingId: string, budgetLeftHbar: number, init?: RequestInit) {
  const path = kind === "contact_purchase" ? "contact" : "records";
  const resource = `${self}/api/${path}/${listingId}`;
  const lines: string[] = [];
  const payer = new AgentPayer(agentId, agentKey, { budget: hbarToTinybars(budgetLeftHbar), perPurchase: PER_PURCHASE, daily: DAILY }, (m) =>
    lines.push(m.trim()),
  );
  const r = await payer.buy<unknown>(resource, init);
  const receipt: Receipt = {
    kind,
    listing: listingId,
    txId: r.txId,
    hashscan: hashscan.tx(r.txId),
    amountHbar: tinybarsToHbar(r.amountTinybars),
    at: new Date().toISOString(),
  };
  receipts.push(receipt);
  logHcsInBackground(
    {
      v: 1,
      kind,
      resource,
      listing: listingId,
      amount_tinybars: r.amountTinybars.toString(),
      payer: r.payer ?? agentId,
      pay_to: r.payTo,
      payment_tx: r.txId,
      budget_left_tinybars: payer.remaining().toString(),
      at: receipt.at,
    },
    receipt,
  );
  return { ...receipt, policy: lines };
}

app.post("/agent/buy", async (c) => {
  const b = (await c.req.json()) as { listingId: string; budgetLeftHbar: number };
  try {
    return c.json(await agentPays("record_purchase", b.listingId, b.budgetLeftHbar));
  } catch (e) {
    const msg = (e as Error).message;
    return c.json({ error: errorText(msg) }, errorStatus(msg) as 403);
  }
});

app.post("/agent/contact", async (c) => {
  const b = (await c.req.json()) as { listingId: string; message: string; budgetLeftHbar: number };
  try {
    const init = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: b.message }) };
    return c.json(await agentPays("contact_purchase", b.listingId, b.budgetLeftHbar, init));
  } catch (e) {
    const msg = (e as Error).message;
    return c.json({ error: errorText(msg) }, errorStatus(msg) as 403);
  }
});

/** Pays the seller everything owed, as a Hedera Scheduled Transaction signed by the treasury. */
app.post("/api/payouts", async (c) => {
  const amount = owed.get(sellerAccount) ?? 0n;
  if (amount <= 0n) return c.json({ error: "nothing owed yet" }, 400);
  const hbar = Hbar.fromTinybars(amount.toString());
  const transfer = new TransferTransaction()
    .addHbarTransfer(AccountId.fromString(treasuryId), hbar.negated())
    .addHbarTransfer(AccountId.fromString(sellerAccount), hbar);
  const create = await new ScheduleCreateTransaction()
    .setScheduledTransaction(transfer)
    .setScheduleMemo(`hissa payout batch ${new Date().toISOString().slice(0, 16)}`)
    .execute(treasury);
  const receipt = await create.getReceipt(treasury);
  owed.set(sellerAccount, 0n);
  const scheduleId = receipt.scheduleId?.toString() ?? "";
  const executedTx = receipt.scheduledTransactionId?.toString().replace(/\?scheduled$/, "") ?? create.transactionId.toString();
  const out: Receipt = {
    kind: "payout",
    txId: executedTx,
    hashscan: `https://hashscan.io/testnet/schedule/${scheduleId}`,
    amountHbar: tinybarsToHbar(amount),
    at: new Date().toISOString(),
  };
  receipts.push(out);
  console.log(`[payout] ${out.amountHbar} HBAR ${treasuryId} → ${sellerAccount}  schedule ${scheduleId}`);
  return c.json({ ...out, scheduleId, seller: sellerAccount, createTx: create.transactionId.toString() });
});

await ensureAgentFunded().catch((e) => console.warn(`Agent top-up check failed: ${(e as Error).message}`));
serve({ fetch: app.fetch, port }, () => {
  console.log(`Hissa demo API on ${self}  (treasury ${treasuryId}, agent ${agentId}, seller ${sellerAccount})`);
});
