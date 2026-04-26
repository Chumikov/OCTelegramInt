import { Bot } from "grammy";
import { config } from "../config.js";
import { registerPermissionCallbacks } from "./handlers/permission.js";
import { registerQuestionCallbacks, awaitingCustomAnswer } from "./handlers/question.js";
import { registerSessionCallbacks, awaitingSessionPrompt } from "./handlers/session.js";
import { addResponse, removePending } from "./state.js";
import { formatReplyConfirmation } from "./formatters.js";

export function createBot(): Bot {
  const bot = new Bot(config.telegramBotToken);

  bot.command("start", async (ctx) => {
    if (ctx.chat?.id?.toString() !== config.allowedChatID) return;
    await ctx.reply(
      "🤖 <b>OpenCode Telegram Bridge</b>\n\nБот запущен и ожидает события от OpenCode.",
      { parse_mode: "HTML" }
    );
  });

  bot.command("status", async (ctx) => {
    if (ctx.chat?.id?.toString() !== config.allowedChatID) return;
    await ctx.reply("✅ Бот активен и принимает ответы.", { parse_mode: "HTML" });
  });

  registerPermissionCallbacks(bot);
  registerQuestionCallbacks(bot);
  registerSessionCallbacks(bot);

  bot.on("message:text", async (ctx) => {
    if (ctx.chat?.id?.toString() !== config.allowedChatID) return;
    const text = ctx.message.text;
    if (text.startsWith("/")) return;

    const userID = `${ctx.from!.id}`;

    const customQ = awaitingCustomAnswer.get(userID);
    if (customQ) {
      awaitingCustomAnswer.delete(userID);
      addResponse({
        id: `qreply:${customQ.requestID}:custom`,
        type: "question_reply",
        requestID: customQ.requestID,
        answers: [[text]],
      });
      removePending(customQ.requestID);
      await ctx.reply(formatReplyConfirmation(`Отправлен: ${text}`), { parse_mode: "HTML" });
      return;
    }

    const sessionPrompt = awaitingSessionPrompt.get(userID);
    if (sessionPrompt) {
      awaitingSessionPrompt.delete(userID);
      addResponse({
        id: `sprompt:${sessionPrompt.sessionID}:custom`,
        type: "session_prompt",
        sessionID: sessionPrompt.sessionID,
        text,
      });
      await ctx.reply(formatReplyConfirmation(`Команда отправлена: ${text}`), { parse_mode: "HTML" });
      return;
    }
  });

  bot.on("callback_query:data", async (ctx) => {
    console.log(`[telegram] Unhandled callback: ${ctx.callbackQuery.data}`);
    await ctx.answerCallbackQuery({ text: "Неизвестное действие" });
  });

  bot.catch((err) => {
    console.error("[telegram] Bot error:", err);
  });

  return bot;
}
