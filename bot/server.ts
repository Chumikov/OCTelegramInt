import { createServer } from "http";
import type { PluginEvent } from "../shared/types.js";
import { registerServer } from "./opencode-client.js";
import { handlePermissionEvent } from "./handlers/permission.js";
import { handleQuestionEvent } from "./handlers/question.js";
import { handleSessionIdleEvent, handleSessionErrorEvent } from "./handlers/session.js";
import type { Bot } from "grammy";
import { config } from "../config.js";

export function createEventServer(bot: Bot) {
  const chatID = parseInt(config.allowedChatID, 10);

  const server = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", timestamp: Date.now() }));
      return;
    }

    if (req.method === "POST" && req.url === "/event") {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
      }

      try {
        const event: PluginEvent = JSON.parse(body);

        switch (event.type) {
          case "register":
            registerServer(event.serverUrl);
            console.log(`[server] Registered opencode server: ${event.serverUrl} (project: ${event.project.name || event.project.id})`);
            break;

          case "permission.asked":
            console.log(`[server] Permission request: ${event.requestID} (${event.permission})`);
            await handlePermissionEvent(bot, chatID, event);
            break;

          case "question.asked":
            console.log(`[server] Question request: ${event.requestID}`);
            await handleQuestionEvent(bot, chatID, event);
            break;

          case "session.idle":
            console.log(`[server] Session idle: ${event.sessionID}`);
            await handleSessionIdleEvent(bot, chatID, event);
            break;

          case "session.error":
            console.log(`[server] Session error: ${event.sessionID || "unknown"}`);
            await handleSessionErrorEvent(bot, chatID, event);
            break;

          default:
            console.log(`[server] Unknown event type: ${(event as any).type}`);
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        console.error("[server] Error processing event:", err);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Invalid payload" }));
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  return server;
}
