import { config as loadDotenv } from "dotenv";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

loadDotenv();

function loadEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  const content = readFileSync(filePath, "utf-8");
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    result[key] = value;
  }
  return result;
}

const envPath = resolve(__dirname, ".env");
const localEnv = loadEnvFile(envPath);

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? localEnv[key] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

export const config = {
  telegramBotToken: getEnv("TELEGRAM_BOT_TOKEN"),
  allowedChatID: getEnv("ALLOWED_CHAT_ID"),
  botPort: parseInt(getEnv("BOT_PORT", "3456"), 10),
  botHost: getEnv("BOT_HOST", "0.0.0.0"),
  contextMessageCount: parseInt(getEnv("CONTEXT_MESSAGE_COUNT", "3"), 10),
  bridgeSecret: getEnv("BRIDGE_SECRET", ""),
  requestTTL: 5 * 60 * 1000,
  cleanupInterval: 60 * 1000,
} as const;

export function validateConfig(): void {
  if (!config.telegramBotToken || config.telegramBotToken === "your_telegram_bot_token_here") {
    throw new Error("TELEGRAM_BOT_TOKEN must be set to a valid bot token");
  }
  if (!config.allowedChatID || config.allowedChatID === "your_telegram_chat_id_here") {
    throw new Error("ALLOWED_CHAT_ID must be set to your Telegram chat ID");
  }
  const port = config.botPort;
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error("BOT_PORT must be a valid port number (1-65535)");
  }
}
