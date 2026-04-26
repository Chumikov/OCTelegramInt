import { createServer, type IncomingMessage, type ServerResponse } from "http";
import type { PluginEvent } from "../shared/types.js";
import { registerServer } from "./opencode-client.js";
import { handlePermissionEvent } from "./handlers/permission.js";
import { handleQuestionEvent } from "./handlers/question.js";
import { handleSessionIdleEvent, handleSessionErrorEvent } from "./handlers/session.js";
import type { Bot } from "grammy";
import { config } from "../config.js";
import { timingSafeEqual } from "crypto";

function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  return timingSafeEqual(bufA, bufB);
}

function authenticate(req: IncomingMessage): boolean {
  const secret = config.bridgeSecret;
  if (!secret) return true;

  const auth = req.headers["authorization"];
  if (!auth || !auth.startsWith("Bearer ")) return false;

  const token = auth.slice(7);
  return constantTimeCompare(token, secret);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJSON(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

export function createEventServer(bot: Bot) {
  const chatID = parseInt(config.allowedChatID, 10);

  const server = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      sendJSON(res, 200, { status: "ok", timestamp: Date.now() });
      return;
    }

    if (req.method === "POST" && req.url === "/event") {
      if (!authenticate(req)) {
        sendJSON(res, 401, { ok: false, error: "Unauthorized" });
        return;
      }

      try {
        const body = await readBody(req);
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

        sendJSON(res, 200, { ok: true });
      } catch (err) {
        console.error("[server] Error processing event:", err);
        sendJSON(res, 400, { ok: false, error: "Invalid payload" });
      }
      return;
    }

    sendJSON(res, 404, { error: "Not found" });
  });

  return server;
}
