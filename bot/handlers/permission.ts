import { Bot, InlineKeyboard } from "grammy";
import { addPending } from "../state.js";
import { replyPermission } from "../opencode-client.js";
import {
  formatPermissionMessage,
  formatReplyConfirmation,
  formatError,
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

    await ctx.answerCallbackQuery({ text: `Обработка: ${action}...` });
    const success = await replyPermission(requestID, action);

    const labels: Record<string, string> = {
      once: "Разрешено один раз",
      always: "Разрешено навсегда",
      reject: "Отклонено",
    };

    const text = success
      ? formatReplyConfirmation(labels[action])
      : formatError("Не удалось отправить ответ. Возможно, запрос уже обработан.");

    try {
      await ctx.editMessageText(text, { parse_mode: "HTML" });
    } catch {
      await ctx.reply(text, { parse_mode: "HTML" });
    }
  });
}
