/** In-memory pending store for GAM approval inline buttons. */

import crypto from "node:crypto";

export type GamApprovalPending = {
  proposalId: string;
  approvalToken: string;
  gamMcpUrl: string;
  chatId: string;
  messageId: string;
  expiresAt: number;
};

const pendingMap = new Map<string, GamApprovalPending>();

function generateShortKey(): string {
  return crypto.randomBytes(4).toString("hex");
}

/**
 * Pre-register a pending approval. Returns the 8-char short key for callback_data.
 * Call `updateMessageId` after sending the Telegram message.
 */
export function registerPending(
  params: Omit<GamApprovalPending, "expiresAt" | "messageId"> & { timeoutSeconds?: number },
): string {
  const key = generateShortKey();
  const ttl = (params.timeoutSeconds ?? 300) * 1000;
  pendingMap.set(key, {
    proposalId: params.proposalId,
    approvalToken: params.approvalToken,
    gamMcpUrl: params.gamMcpUrl,
    chatId: params.chatId,
    messageId: "",
    expiresAt: Date.now() + ttl,
  });
  setTimeout(() => pendingMap.delete(key), ttl + 5_000);
  return key;
}

export function updateMessageId(shortKey: string, messageId: string): void {
  const entry = pendingMap.get(shortKey);
  if (entry) entry.messageId = messageId;
}

export function lookup(shortKey: string): GamApprovalPending | null {
  const entry = pendingMap.get(shortKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    pendingMap.delete(shortKey);
    return null;
  }
  return entry;
}

export function remove(shortKey: string): void {
  pendingMap.delete(shortKey);
}
