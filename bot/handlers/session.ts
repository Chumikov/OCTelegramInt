import { Bot, InlineKeyboard } from "grammy";
import { addPending, addResponse, getPending } from "../state.js";
import {
  formatSessionIdleMessage,
  formatSessionErrorMessage,
  formatReplyConfirmation,
} from "../formatters.js";
import type { SessionIdlePayload, SessionErrorPayload, DiffSummary } from "../../shared/types.js";

export const awaitingSessionPrompt = new Map<
  string,
  { sessionID: string; chatID: number }
>();

const lastIdleData = new Map<string, { diff?: DiffSummary; chatID: number }>();

export function setLastIdleData(sessionID: string, data: { diff?: DiffSummary; chatID: number }) {
  lastIdleData.set(sessionID, data);
}

export async function handleSessionIdleEvent(
  bot: Bot,
  chatID: number,
  payload: SessionIdlePayload
): Promise<void> {
  console.log(`[session] Formatting idle message for session=${payload.sessionID.slice(0, 8)}`);
  const text = formatSessionIdleMessage(payload);
  console.log(`[session] Idle message length=${text.length}, sending to chatID=${chatID}`);
  const keyboard = new InlineKeyboard()
    .text("▶️ Продолжить", `session:continue:${payload.sessionID}`)
    .text("💬 Команда", `session:prompt:${payload.sessionID}`)
    .row()
    .text("📊 Diff", `session:diff:${payload.sessionID}`);

  try {
    const message = await bot.api.sendMessage(chatID, text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
    console.log(`[session] Idle message sent OK: message_id=${message.message_id}`);

    addPending({
      type: "session_idle",
      requestID: `idle:${payload.sessionID}`,
      sessionID: payload.sessionID,
      telegramMessageID: message.message_id,
      chatID: message.chat.id,
      payload,
      createdAt: Date.now(),
    });
    setLastIdleData(payload.sessionID, { diff: payload.diff, chatID: message.chat.id });
  } catch (err) {
    console.error(`[session] FAILED to send idle message:`, err);
    throw err;
  }
}

export async function handleSessionErrorEvent(
  bot: Bot,
  chatID: number,
  payload: SessionErrorPayload
): Promise<void> {
  const sid = payload.sessionID || "unknown";
  console.log(`[session] Formatting error message for session=${sid.slice(0, 8)}`);
  const text = formatSessionErrorMessage(payload);
  console.log(`[session] Error message length=${text.length}, sending to chatID=${chatID}`);
  const keyboard = new InlineKeyboard()
    .text("▶️ Продолжить", `session:continue:${sid}`)
    .row()
    .text("🔄 С командой", `session:prompt:${sid}`);

  try {
    const message = await bot.api.sendMessage(chatID, text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
    console.log(`[session] Error message sent OK: message_id=${message.message_id}`);

    addPending({
      type: "session_error",
      requestID: `error:${sid}`,
      sessionID: sid,
      telegramMessageID: message.message_id,
      chatID: message.chat.id,
      payload,
      createdAt: Date.now(),
    });
  } catch (err) {
    console.error(`[session] FAILED to send error message:`, err);
    throw err;
  }
}

export function registerSessionCallbacks(bot: Bot): void {
  bot.callbackQuery(/^session:continue:(.+)$/, async (ctx) => {
    const match = ctx.callbackQuery.data!.match(/^session:continue:(.+)$/)!;
    const sessionID = match[1];
    console.log(`[session] Callback continue: sessionID=${sessionID.slice(0, 8)}`);

    addResponse({
      id: `sprompt:${sessionID}:continue`,
      type: "session_prompt",
      sessionID,
      text: "continue",
    });
    console.log(`[session] Response queued: session_prompt continue for ${sessionID.slice(0, 8)}`);

    try { await ctx.answerCallbackQuery(); } catch {}
    try { await ctx.editMessageText(formatReplyConfirmation("Продолжить — отправлено"), { parse_mode: "HTML" }); } catch {}
  });

  bot.callbackQuery(/^session:prompt:(.+)$/, async (ctx) => {
    const match = ctx.callbackQuery.data!.match(/^session:prompt:(.+)$/)!;
    const sessionID = match[1];

    awaitingSessionPrompt.set(`${ctx.from!.id}`, { sessionID, chatID: ctx.chat!.id });
    try { await ctx.answerCallbackQuery(); } catch {}
    await ctx.reply("💬 Введите команду для отправки в сессию:");
  });

  bot.callbackQuery(/^session:diff:(.+)$/, async (ctx) => {
    const match = ctx.callbackQuery.data!.match(/^session:diff:(.+)$/)!;
    const sessionID = match[1];

    const idleData = lastIdleData.get(sessionID);
    const pending = getPending(`idle:${sessionID}`);
    const diff = idleData?.diff || (pending?.payload as SessionIdlePayload | undefined)?.diff;

    try { await ctx.answerCallbackQuery(); } catch {}

    if (diff) {
      await ctx.reply(
        `📊 <b>Изменения</b>\n\n📝 Файлов: ${diff.files} (add: ${diff.additions} / del: ${diff.deletions})`,
        { parse_mode: "HTML" }
      );
    } else {
      await ctx.reply("📊 Нет данных об изменениях", { parse_mode: "HTML" });
    }
  });
}
