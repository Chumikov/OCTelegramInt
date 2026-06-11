import { Bot, InlineKeyboard } from "grammy";
import { addPending, addResponse, getPending } from "../state.js";
import {
  formatPermissionMessage,
  formatReplyConfirmation,
} from "../formatters.js";
import type { PermissionEventPayload } from "../../shared/types.js";

export async function handlePermissionEvent(
  bot: Bot,
  chatID: number,
  payload: PermissionEventPayload
): Promise<void> {
  console.log(`[permission] Formatting message for requestID=${payload.requestID}`);
  const text = formatPermissionMessage(payload);
  console.log(`[permission] Message length=${text.length}, sending to chatID=${chatID}`);

  const keyboard = new InlineKeyboard()
    .text("✅ Разрешить", `perm:once:${payload.requestID}`)
    .text("✅ Всегда", `perm:always:${payload.requestID}`)
    .row()
    .text("❌ Отклонить", `perm:reject:${payload.requestID}`);

  try {
    const message = await bot.api.sendMessage(chatID, text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
    console.log(`[permission] Message sent OK: message_id=${message.message_id}`);

    addPending({
      type: "permission",
      requestID: payload.requestID,
      sessionID: payload.sessionID,
      telegramMessageID: message.message_id,
      chatID: message.chat.id,
      payload,
      createdAt: Date.now(),
    });
  } catch (err) {
    console.error(`[permission] FAILED to send message:`, err);
    throw err;
  }
}

export function registerPermissionCallbacks(bot: Bot): void {
  bot.callbackQuery(/^perm:(once|always|reject):(.+)$/, async (ctx) => {
    const match = ctx.callbackQuery.data!.match(/^perm:(once|always|reject):(.+)$/)!;
    const action = match[1] as "once" | "always" | "reject";
    const requestID = match[2];

    await ctx.answerCallbackQuery({ text: "Принято" });

    const pending = getPending(requestID);

    addResponse({
      id: `perm:${requestID}:${action}`,
      type: "permission_reply",
      requestID,
      sessionID: pending?.sessionID || "",
      reply: action,
    });

    const labels: Record<string, string> = {
      once: "Разрешено один раз",
      always: "Разрешено навсегда",
      reject: "Отклонено",
    };

    try {
      await ctx.editMessageText(formatReplyConfirmation(labels[action]), { parse_mode: "HTML" });
    } catch {
      await ctx.reply(formatReplyConfirmation(labels[action]), { parse_mode: "HTML" });
    }
  });
}
