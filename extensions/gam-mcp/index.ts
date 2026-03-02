/**
 * GAM MCP approval flow extension.
 *
 * Registers:
 * - `gam_request_approval` agent tool — sends Telegram inline buttons for approve/deny
 * - Telegram callback handler for "gam:" prefix — handles button taps
 *
 * Config (plugins.gam-mcp):
 *   enabled: true
 *   url: "http://dc1-1.local:9900"
 *   approverIds: [123456789]
 *   timeoutSeconds: 300
 *   telegramAccountId: "default"
 */

import { Type } from "@sinclair/typebox";
import { registerTelegramCallbackPrefix } from "openclaw/plugin-sdk";
import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { handleGamCallback } from "./src/callback-handler.js";
import { registerPending, updateMessageId } from "./src/pending-store.js";

type GamMcpPluginConfig = {
  enabled?: boolean;
  url?: string;
  approvalChannel?: string;
  approverIds?: Array<string | number>;
  timeoutSeconds?: number;
  telegramAccountId?: string;
};

function readPluginConfig(api: OpenClawPluginApi): GamMcpPluginConfig {
  const raw = (api.pluginConfig as Record<string, unknown>) ?? {};
  return {
    enabled: raw.enabled === true,
    url: typeof raw.url === "string" ? raw.url : undefined,
    approvalChannel: typeof raw.approvalChannel === "string" ? raw.approvalChannel : "telegram",
    approverIds: Array.isArray(raw.approverIds) ? raw.approverIds : undefined,
    timeoutSeconds: typeof raw.timeoutSeconds === "number" ? raw.timeoutSeconds : 300,
    telegramAccountId:
      typeof raw.telegramAccountId === "string" ? raw.telegramAccountId : undefined,
  };
}

const GamApprovalSchema = Type.Object({
  proposal_id: Type.String({ description: "The proposal ID returned by a gam-mcp propose tool" }),
  approval_token: Type.String({
    description: "The approval token returned by a gam-mcp propose tool",
  }),
  command_preview: Type.String({ description: "Human-readable preview of the GAM command" }),
  tool_name: Type.String({ description: "Name of the propose tool that created this proposal" }),
});

export default function register(api: OpenClawPluginApi) {
  const pluginCfg = readPluginConfig(api);

  if (!pluginCfg.enabled || !pluginCfg.url) return;

  // Register Telegram callback handler for "gam:" prefix
  registerTelegramCallbackPrefix("gam:", (ctx) => handleGamCallback(ctx, pluginCfg));

  // Register the agent tool
  api.registerTool(
    (ctx) => {
      if (ctx.sandboxed) return null;

      const sendTelegram = api.runtime?.channel?.telegram?.sendMessageTelegram;
      if (!sendTelegram) return null;

      const tool: AnyAgentTool = {
        name: "gam_request_approval",
        label: "GAM Approval Request",
        ownerOnly: true,
        description: [
          "Send an interactive approval request for a GAM proposal.",
          "Use this after calling a gam-mcp propose tool (drive, groups, filters).",
          "The user will see Approve/Deny buttons in Telegram and can tap to act.",
        ].join(" "),
        parameters: GamApprovalSchema,
        execute: async (_toolCallId, args) => {
          const params = args as Record<string, unknown>;
          const proposalId = String(params.proposal_id ?? "");
          const approvalToken = String(params.approval_token ?? "");
          const commandPreview = String(params.command_preview ?? "");
          const toolName = String(params.tool_name ?? "");

          if (!proposalId || !approvalToken) {
            return jsonResult({ ok: false, error: "Missing proposal_id or approval_token" });
          }

          // Resolve the chat target from the plugin tool context
          const chatId = ctx.messageTo ?? "";
          if (!chatId) {
            return jsonResult({ ok: false, error: "No chat target available (messageTo not set)" });
          }

          const timeoutSeconds = pluginCfg.timeoutSeconds ?? 300;

          // Pre-register to get short key for callback_data
          const shortKey = registerPending({
            proposalId,
            approvalToken,
            gamMcpUrl: pluginCfg.url!,
            chatId,
            timeoutSeconds,
          });

          const preview =
            commandPreview.length > 200 ? commandPreview.slice(0, 199) + "\u2026" : commandPreview;
          const expiresLabel = `${Math.round(timeoutSeconds / 60)}m`;
          const text = [
            `<b>GAM Approval Request</b>`,
            ``,
            `<b>Tool:</b> ${esc(toolName)}`,
            `<b>Command:</b> <code>${esc(preview)}</code>`,
            `<b>Proposal:</b> <code>${esc(proposalId)}</code>`,
            ``,
            `<i>Expires in ${expiresLabel}.</i>`,
          ].join("\n");

          const buttons = [
            [
              { text: "\u2713 Approve", callback_data: `gam:k=${shortKey};a=y` },
              { text: "\u2717 Deny", callback_data: `gam:k=${shortKey};a=n` },
            ],
          ];

          try {
            const result = await sendTelegram(chatId, text, {
              accountId: pluginCfg.telegramAccountId,
              textMode: "html",
              buttons,
            });
            updateMessageId(shortKey, result.messageId);
            return jsonResult({ ok: true, proposal_id: proposalId });
          } catch (err) {
            return jsonResult({ ok: false, error: String(err) });
          }
        },
      };
      return tool;
    },
    { names: ["gam_request_approval"], optional: true },
  );
}

function jsonResult(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload) }], details: payload };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
