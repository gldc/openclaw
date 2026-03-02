/** Handles GAM approval/deny inline button callbacks. */

import type { TelegramCallbackContext } from "openclaw/plugin-sdk";
import { gamMcpApprove, gamMcpDeny } from "./gam-mcp-client.js";
import { lookup, remove } from "./pending-store.js";

export type GamMcpConfig = {
  approverIds?: Array<string | number>;
};

/** Parse callback_data: "gam:k=<8hex>;a=y" or "gam:k=<8hex>;a=n" */
function parseGamCallback(data: string): { shortKey: string; action: "approve" | "deny" } | null {
  const m = data.match(/^gam:k=([0-9a-f]{8});a=(y|n)$/);
  if (!m) return null;
  return { shortKey: m[1], action: m[2] === "y" ? "approve" : "deny" };
}

export async function handleGamCallback(
  ctx: TelegramCallbackContext,
  pluginCfg: GamMcpConfig,
): Promise<void> {
  const parsed = parseGamCallback(ctx.data);
  if (!parsed) return;

  const pending = lookup(parsed.shortKey);
  if (!pending) {
    await ctx.editMessage("This approval has expired or was already handled.").catch(() => {});
    return;
  }

  // Client-side approver guard (server-side also enforces)
  const approverIds = pluginCfg.approverIds;
  if (approverIds && approverIds.length > 0) {
    const allowed = approverIds.some((id) => String(id) === ctx.senderId);
    if (!allowed) return; // silent — let authorized users still act
  }

  try {
    if (parsed.action === "approve") {
      const result = await gamMcpApprove(pending.gamMcpUrl, {
        proposal_id: pending.proposalId,
        approval_token: pending.approvalToken,
        approved_by: ctx.senderId,
      });
      const msg = result.ok
        ? `\u2713 <b>Approved</b> by ${esc(ctx.senderName)}`
        : `\u26a0 Approval failed: ${esc(result.error ?? "unknown error")}`;
      await ctx.editMessage(msg, { parse_mode: "HTML" }).catch(() => {});
    } else {
      const result = await gamMcpDeny(pending.gamMcpUrl, {
        proposal_id: pending.proposalId,
        denied_by: ctx.senderId,
      });
      const msg = result.ok
        ? `\u2717 <b>Denied</b> by ${esc(ctx.senderName)}`
        : `\u26a0 Deny failed: ${esc(result.error ?? "unknown error")}`;
      await ctx.editMessage(msg, { parse_mode: "HTML" }).catch(() => {});
    }
  } catch (err) {
    await ctx
      .editMessage(`\u26a0 Error: ${esc(String(err))}`, { parse_mode: "HTML" })
      .catch(() => {});
  }

  remove(parsed.shortKey);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
