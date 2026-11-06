/**
 * Tamper-evident agent payment log on a Hedera Consensus Service topic.
 * The topic's submit key is the agent's key, so only the agent can append, and
 * every message gets a consensus timestamp and sequence number nobody can rewrite.
 */
import { TopicId, TopicMessageSubmitTransaction, type Client } from "@hiero-ledger/sdk";

export type AgentPaymentLog = {
  v: 1;
  kind: "record_purchase" | "insight_purchase";
  resource: string;
  listing?: string;
  analysis_id?: string;
  amount_tinybars: string;
  payer: string;
  pay_to: string;
  payment_tx: string;
  budget_left_tinybars: string;
  at: string;
};

export async function logPaymentToHcs(client: Client, topicId: string, entry: AgentPaymentLog) {
  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(TopicId.fromString(topicId))
    .setMessage(JSON.stringify(entry))
    .execute(client);
  const receipt = await tx.getReceipt(client);
  return {
    txId: tx.transactionId.toString(),
    sequenceNumber: receipt.topicSequenceNumber?.toString() ?? "?",
    status: receipt.status.toString(),
  };
}
