import { Bot, InlineKeyboard } from "grammy";
import { addPending, addResponse } from "../state.js";
import {
  formatSessionIdleMessage,
  formatSessionErrorMessage,
  formatReplyConfirmation,
} from "../formatters.js";
import type { SessionIdlePayload, SessionErrorPayload } from "../../shared/types.js";

export const awaitingSessionPrompt = new Map<
  string,
  { sessionID: string; chatID: number }
>();

export async function handleSessionIdleEvent(
  bot: Bot,
  chatID: number,
  payload: SessionIdlePayload
): Promise<void> {
  const text = formatSessionIdleMessage(payload);
  const keyboard = new InlineKeyboard()
    .text("▶️ Продолжить", `session:continue:${payload.sessionID}`)
    .row()
    .text("🔄 С командой", `session:prompt:${payload.sessionID}`);

  const message = await bot.api.sendMessage(chatID, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });

  addPending({
    type: "session_idle",
    requestID: `idle:${payload.sessionID}`,
    sessionID: payload.sessionID,
    telegramMessageID: message.message_id,
    chatID: message.chat.id,
    payload,
    createdAt: Date.now(),
  });
}

export async function handleSessionErrorEvent(
  bot: Bot,
  chatID: number,
  payload: SessionErrorPayload
): Promise<void> {
  const text = formatSessionErrorMessage(payload);
  const sid = payload.sessionID || "unknown";
  const keyboard = new InlineKeyboard()
    .text("▶️ Продолжить", `session:continue:${sid}`)
    .row()
    .text("🔄 С командой", `session:prompt:${sid}`);

  const message = await bot.api.sendMessage(chatID, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });

  addPending({
    type: "session_error",
    requestID: `error:${sid}`,
    sessionID: sid,
    telegramMessageID: message.message_id,
    chatID: message.chat.id,
    payload,
    createdAt: Date.now(),
  });
}

export function registerSessionCallbacks(bot: Bot): void {
  bot.callbackQuery(/^session:continue:(.+)$/, async (ctx) => {
    const match = ctx.callbackQuery.data!.match(/^session:continue:(.+)$/)!;
    const sessionID = match[1];

    await ctx.answerCallbackQuery({ text: "Принято" });

    addResponse({
      id: `sprompt:${sessionID}:continue`,
      type: "session_prompt",
      sessionID,
      text: "continue",
    });

    try {
      await ctx.editMessageText(formatReplyConfirmation("Команда 'продолжить' отправлена"), { parse_mode: "HTML" });
    } catch {
      await ctx.reply(formatReplyConfirmation("Команда 'продолжить' отправлена"), { parse_mode: "HTML" });
    }
  });

  bot.callbackQuery(/^session:prompt:(.+)$/, async (ctx) => {
    const match = ctx.callbackQuery.data!.match(/^session:prompt:(.+)$/)!;
    const sessionID = match[1];

    awaitingSessionPrompt.set(`${ctx.from!.id}`, { sessionID, chatID: ctx.chat!.id });
    await ctx.answerCallbackQuery({ text: "" });
    await ctx.reply("💬 Введите команду для отправки в сессию:");
  });
}
