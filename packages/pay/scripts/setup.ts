/**
 * One-time Hedera testnet setup, idempotent. Uses the treasury (platform) account
 * from .env to create:
 *   1. the merchant agent's own ECDSA account, funded with AGENT_INITIAL_HBAR;
 *   2. the HCS topic the agent logs every payment to (submit key = agent key).
 * New values are appended to .env. Existing values are never overwritten.
 */
import fs from "node:fs";
import {
  AccountCreateTransaction,
  Hbar,
  PrivateKey,
  TopicCreateTransaction,
} from "@hiero-ledger/sdk";
import { clientFor, hashscan, hbarBalance, parseEcdsaKey, requireEnv } from "../src/hedera.js";

const ENV_FILE = ".env";

function appendEnv(lines: Record<string, string>) {
  const block = Object.entries(lines).map(([k, v]) => `${k}=${v}`).join("\n");
  fs.appendFileSync(ENV_FILE, `\n${block}\n`, { mode: 0o600 });
  for (const k of Object.keys(lines)) process.env[k] = lines[k];
}

async function main() {
  const treasuryId = requireEnv("HEDERA_TREASURY_ID");
  const treasuryKey = parseEcdsaKey(requireEnv("HEDERA_TREASURY_KEY"));
  const treasury = clientFor(treasuryId, treasuryKey);
  console.log(`Treasury ${treasuryId}: ${await hbarBalance(treasuryId)} HBAR  ${hashscan.account(treasuryId)}`);

  // 1 · merchant agent account
  if (!process.env["AGENT_HEDERA_ACCOUNT_ID"]) {
    const agentKey = PrivateKey.generateECDSA();
    const initial = Number(process.env["AGENT_INITIAL_HBAR"] ?? 30);
    const tx = await new AccountCreateTransaction()
      .setECDSAKeyWithAlias(agentKey.publicKey)
      .setInitialBalance(new Hbar(initial))
      .setAccountMemo("datamarket merchant agent (testnet)")
      .execute(treasury);
    const receipt = await tx.getReceipt(treasury);
    const agentId = receipt.accountId!.toString();
    appendEnv({ AGENT_HEDERA_ACCOUNT_ID: agentId, AGENT_HEDERA_PRIVATE_KEY: `0x${agentKey.toStringRaw()}` });
    console.log(`Created agent account ${agentId} with ${initial} HBAR  ${hashscan.tx(tx.transactionId.toString())}`);
  } else {
    console.log(`Agent account exists: ${process.env["AGENT_HEDERA_ACCOUNT_ID"]}`);
  }

  // 2 · HCS payment-log topic, writable only by the agent
  if (!process.env["HEDERA_PAYMENT_TOPIC_ID"]) {
    const agentKey = parseEcdsaKey(requireEnv("AGENT_HEDERA_PRIVATE_KEY"));
    const tx = await new TopicCreateTransaction()
      .setTopicMemo("datamarket: merchant agent x402 payment log v1")
      .setAdminKey(treasuryKey.publicKey)
      .setSubmitKey(agentKey.publicKey)
      .execute(treasury);
    const receipt = await tx.getReceipt(treasury);
    const topicId = receipt.topicId!.toString();
    appendEnv({ HEDERA_PAYMENT_TOPIC_ID: topicId });
    console.log(`Created HCS topic ${topicId}  ${hashscan.topic(topicId)}`);
  } else {
    console.log(`Payment topic exists: ${process.env["HEDERA_PAYMENT_TOPIC_ID"]}`);
  }

  const agentId = requireEnv("AGENT_HEDERA_ACCOUNT_ID");
  console.log(`Agent ${agentId}: ${await hbarBalance(agentId)} HBAR  ${hashscan.account(agentId)}`);
  treasury.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
