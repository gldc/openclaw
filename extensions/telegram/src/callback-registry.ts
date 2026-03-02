/**
 * Generic registry for Telegram callback_data prefix handlers.
 * Plugins register a prefix (e.g. "gam:") and a handler function.
 * bot-handlers.ts checks this registry before falling through to the
 * synthetic-message handler.
 */

export type TelegramCallbackContext = {
  data: string;
  senderId: string;
  senderName: string;
  chatId: string | number;
  messageId: number;
  editMessage: (text: string, params?: Record<string, unknown>) => Promise<unknown>;
};

export type TelegramCallbackHandler = (ctx: TelegramCallbackContext) => Promise<void>;

const handlers = new Map<string, TelegramCallbackHandler>();

/** Register a handler for callback_data starting with the given prefix. */
export function registerTelegramCallbackPrefix(
  prefix: string,
  handler: TelegramCallbackHandler,
): void {
  handlers.set(prefix, handler);
}

/**
 * Attempt to dispatch callback_data to a registered prefix handler.
 * Returns true if handled, false if no handler matched.
 */
export async function dispatchTelegramCallback(ctx: TelegramCallbackContext): Promise<boolean> {
  for (const [prefix, handler] of handlers) {
    if (ctx.data.startsWith(prefix)) {
      await handler(ctx);
      return true;
    }
  }
  return false;
}
