import { Bot, InlineKeyboard } from "grammy";
import { addPending } from "../state.js";
import { replyQuestion, rejectQuestion } from "../opencode-client.js";
import {
  formatQuestionMessage,
  formatReplyConfirmation,
  formatError,
} from "../formatters.js";
import type { QuestionEventPayload } from "../../shared/types.js";

export const awaitingCustomAnswer = new Map<
  string,
  { requestID: string; chatID: number }
>();

export async function handleQuestionEvent(
  bot: Bot,
  chatID: number,
  payload: QuestionEventPayload
): Promise<void> {
  if (payload.questions.length === 0) return;

  const text = formatQuestionMessage(payload);
  const q = payload.questions[0];

  const keyboard = new InlineKeyboard();
  for (let i = 0; i < q.options.length; i++) {
    keyboard.text(q.options[i].label, `q:opt:${payload.requestID}:${i}`);
    if (i % 2 === 1) keyboard.row();
  }
  if (q.options.length > 0 && q.options.length % 2 === 1) keyboard.row();

  keyboard.row().text("✍️ Свой ответ", `q:custom:${payload.requestID}`);
  keyboard.row().text("❌ Отклонить", `q:reject:${payload.requestID}`);

  const message = await bot.api.sendMessage(chatID, text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });

  addPending({
    type: "question",
    requestID: payload.requestID,
    sessionID: payload.sessionID,
    telegramMessageID: message.message_id,
    chatID: message.chat.id,
    payload,
    createdAt: Date.now(),
  });
}

export function registerQuestionCallbacks(bot: Bot): void {
  bot.callbackQuery(/^q:opt:(.+):(\d+)$/, async (ctx) => {
    const match = ctx.callbackQuery.data!.match(/^q:opt:(.+):(\d+)$/)!;
    const requestID = match[1];
    const optIndex = parseInt(match[2], 10);

    await ctx.answerCallbackQuery({ text: "Обработка..." });

    const pending = getPending(requestID);
    if (!pending) {
      await safeEdit(ctx, formatError("Запрос не найден или устарел"));
      return;
    }

    const payload = pending.payload as QuestionEventPayload;
    const selectedLabel = payload.questions?.[0]?.options[optIndex]?.label;
    if (!selectedLabel) {
      await ctx.answerCallbackQuery({ text: "Ошибка: опция не найдена" });
      return;
    }

    const success = await replyQuestion(requestID, [[selectedLabel]]);
    removePending(requestID);
    await safeEdit(ctx, success ? formatReplyConfirmation(`Выбрано: ${selectedLabel}`) : formatError("Не удалось отправить ответ"));
  });

  bot.callbackQuery(/^q:custom:(.+)$/, async (ctx) => {
    const match = ctx.callbackQuery.data!.match(/^q:custom:(.+)$/)!;
    const requestID = match[1];

    awaitingCustomAnswer.set(`${ctx.from!.id}`, { requestID, chatID: ctx.chat!.id });
    await ctx.answerCallbackQuery({ text: "" });
    await ctx.reply("✍️ Введите свой ответ текстом (без команды /):");
  });

  bot.callbackQuery(/^q:reject:(.+)$/, async (ctx) => {
    const match = ctx.callbackQuery.data!.match(/^q:reject:(.+)$/)!;
    const requestID = match[1];

    await ctx.answerCallbackQuery({ text: "Отклонение..." });
    const success = await rejectQuestion(requestID);
    removePending(requestID);
    await safeEdit(ctx, success ? formatReplyConfirmation("Вопрос отклонён") : formatError("Не удалось отклонить"));
  });
}

async function safeEdit(ctx: any, text: string): Promise<void> {
  try {
    await ctx.editMessageText(text, { parse_mode: "HTML" });
  } catch {
    await ctx.reply(text, { parse_mode: "HTML" });
  }
}

import { getPending, removePending } from "../state.js";
