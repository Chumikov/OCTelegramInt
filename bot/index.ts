import { config, validateConfig } from "../config.js";
import { createBot } from "./telegram.js";
import { createEventServer } from "./server.js";
import { startCleanup, stopCleanup } from "./state.js";

async function main() {
  console.log("[main] Starting OpenCode Telegram Bridge...");
  validateConfig();
  console.log(`[main] Config: port=${config.botPort}, chat=${config.allowedChatID}`);

  const bot = createBot();

  const eventServer = createEventServer(bot);
  eventServer.listen(config.botPort, config.botHost, () => {
    console.log(`[main] Event server listening on ${config.botHost}:${config.botPort}`);
  });

  startCleanup();

  const shutdown = async (signal: string) => {
    console.log(`\n[main] Received ${signal}, shutting down...`);
    stopCleanup();
    bot.stop();
    eventServer.close();
    process.exit(0);
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  console.log("[main] Starting Telegram bot (long polling)...");
  await bot.start({
    onStart: (info) => {
      console.log(`[main] Bot started: @${info.username}`);
    },
  });
}

main().catch((err) => {
  console.error("[main] Fatal error:", err);
  process.exit(1);
});
