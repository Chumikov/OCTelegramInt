import { Bot } from "grammy";
import { config } from "../config.js";
import { registerPermissionCallbacks } from "./handlers/permission.js";
import { registerQuestionCallbacks, awaitingCustomAnswer } from "./handlers/question.js";
import { registerSessionCallbacks, awaitingSessionPrompt } from "./handlers/session.js";
import { replyQuestion } from "./opencode-client.js";
import { removePending } from "./state.js";
import { formatReplyConfirmation, formatError } from "./formatters.js";

export function createBot(): Bot {
  const bot = new Bot(config.telegramBotToken);

  bot.command("start", async (ctx) => {
    if (ctx.chat?.id?.toString() !== config.allowedChatID) {
      return;
    }
    await ctx.reply(
      "🤖 <b>OpenCode Telegram Bridge</b>\n\nБот запущен и ожидает события от OpenCode.\nИспользуйте /status для проверки состояния.",
      { parse_mode: "HTML" }
    );
  });

  bot.command("status", async (ctx) => {
    if (ctx.chat?.id?.toString() !== config.allowedChatID) return;
    await ctx.reply(
      `✅ Бот активен\n🔗 Сервер: ${config.opencodeServerUrl}\n⏳ Ожидание: ${config.botPort}`,
      { parse_mode: "HTML" }
    );
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
      const success = await replyQuestion(customQ.requestID, [[text]]);
      removePending(customQ.requestID);
      await ctx.reply(
        success ? formatReplyConfirmation(`Отправлен: ${text}`) : formatError("Не удалось отправить ответ"),
        { parse_mode: "HTML" }
      );
      return;
    }

    const sessionPrompt = awaitingSessionPrompt.get(userID);
    if (sessionPrompt) {
      awaitingSessionPrompt.delete(userID);
      const { sessionID } = sessionPrompt;
      const success = await (await import("./opencode-client.js")).sendPrompt(sessionID, text);
      await ctx.reply(
        success ? formatReplyConfirmation(`Команда отправлена: ${text}`) : formatError("Не удалось отправить команду"),
        { parse_mode: "HTML" }
      );
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
