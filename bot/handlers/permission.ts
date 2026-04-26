import { Bot, InlineKeyboard } from "grammy";
import { addPending, addResponse } from "../state.js";
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
  const text = formatPermissionMessage(payload);
  const keyboard = new InlineKeyboard()
    .text("✅ Разрешить", `perm:once:${payload.requestID}`)
    .text("✅ Всегда", `perm:always:${payload.requestID}`)
    .row()
    .text("❌ Отклонить", `perm:reject:${payload.requestID}`);

  const message = await bot.api.sendMessage(chatID, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });

  addPending({
    type: "permission",
    requestID: payload.requestID,
    sessionID: payload.sessionID,
    telegramMessageID: message.message_id,
    chatID: message.chat.id,
    payload,
    createdAt: Date.now(),
  });
}

export function registerPermissionCallbacks(bot: Bot): void {
  bot.callbackQuery(/^perm:(once|always|reject):(.+)$/, async (ctx) => {
    const match = ctx.callbackQuery.data!.match(/^perm:(once|always|reject):(.+)$/)!;
    const action = match[1] as "once" | "always" | "reject";
    const requestID = match[2];

    await ctx.answerCallbackQuery({ text: "Принято" });

    addResponse({
      id: `perm:${requestID}:${action}`,
      type: "permission_reply",
      requestID,
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
