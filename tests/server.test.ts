import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer as createHttpServer, type Server } from "http";

const MOCK_PORT = 19876;
const BASE = `http://127.0.0.1:${MOCK_PORT}`;

let sentMessages: Array<{ chatID: number; text: string; opts?: any }> = [];
let server: Server;

function makeMockBot() {
  sentMessages = [];
  return {
    api: {
      sendMessage: async (chatID: number, text: string, opts?: any) => {
        sentMessages.push({ chatID, text, opts });
        return { message_id: Date.now(), chat: { id: chatID } };
      },
    },
    callbackQuery: () => {},
    on: () => {},
    command: () => {},
    catch: () => {},
    start: () => {},
  } as any;
}

async function req(
  path: string,
  method: string = "GET",
  body?: unknown,
  headers?: Record<string, string>
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts: RequestInit = { method, headers: { "Content-Type": "application/json", ...headers } };
    if (body) opts.body = JSON.stringify(body);

    fetch(url.toString(), opts as any)
      .then(async (res) => {
        const text = await res.text();
        try {
          resolve({ status: res.status, body: JSON.parse(text) });
        } catch {
          resolve({ status: res.status, body: text });
        }
      })
      .catch(reject);
  });
}

describe("HTTP Server", () => {
  before(async () => {
    process.env.BRIDGE_SECRET = "testsecret123";
    process.env.TELEGRAM_BOT_TOKEN = "0000000000:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    process.env.ALLOWED_CHAT_ID = "123456";
    process.env.BOT_PORT = String(MOCK_PORT);

    const { createEventServer } = await import("../bot/server.js");
    const bot = makeMockBot();
    server = createEventServer(bot);
    await new Promise<void>((res) => server.listen(MOCK_PORT, "127.0.0.1", () => res()));
  });

  after(async () => {
    await new Promise<void>((res) => server.close(() => res()));
  });

  beforeEach(() => {
    sentMessages = [];
  });

  describe("GET /health", () => {
    it("should return ok status", async () => {
      const res = await req("/health");
      assert.equal(res.status, 200);
      assert.equal(res.body.status, "ok");
      assert.ok(res.body.timestamp);
    });
  });

  describe("GET /responses", () => {
    it("should require auth", async () => {
      const res = await req("/responses");
      assert.equal(res.status, 401);
    });

    it("should return empty array when authed", async () => {
      const res = await req("/responses", "GET", undefined, {
        Authorization: "Bearer testsecret123",
      });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, []);
    });

    it("should reject wrong secret", async () => {
      const res = await req("/responses", "GET", undefined, {
        Authorization: "Bearer wrongsecret",
      });
      assert.equal(res.status, 401);
    });
  });

  describe("DELETE /responses/:id", () => {
    it("should require auth", async () => {
      const res = await req("/responses/nonexistent", "DELETE");
      assert.equal(res.status, 401);
    });

    it("should return ok false for non-existent", async () => {
      const res = await req("/responses/nonexistent", "DELETE", undefined, {
        Authorization: "Bearer testsecret123",
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, false);
    });
  });

  describe("POST /event", () => {
    it("should require auth", async () => {
      const res = await req("/event", "POST", { type: "register" });
      assert.equal(res.status, 401);
    });

    it("should reject invalid JSON", async () => {
      const url = new URL("/event", BASE);
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer testsecret123",
        },
        body: "not valid json{{{",
      });
      assert.equal(res.status, 400);
    });

    it("should handle register event", async () => {
      const res = await req("/event", "POST", {
        type: "register",
        serverUrl: "http://localhost:9999",
        project: { id: "proj1", name: "Test Project", directory: "/home/test" },
      }, { Authorization: "Bearer testsecret123" });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
    });

    it("should handle permission.asked event", async () => {
      const res = await req("/event", "POST", {
        type: "permission.asked",
        requestID: "perm1",
        sessionID: "ses1",
        permission: "external_command",
        patterns: [],
        metadata: { toolName: "bash", toolArgs: '{"cmd":"ls"}' },
        always: [],
        context: [],
      }, { Authorization: "Bearer testsecret123" });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(sentMessages.length, 1);
      assert.ok(sentMessages[0].text.includes("🔐"));
      assert.ok(sentMessages[0].opts?.reply_markup);
    });

    it("should handle question.asked event", async () => {
      const res = await req("/event", "POST", {
        type: "question.asked",
        requestID: "q1",
        sessionID: "ses1",
        questions: [{
          question: "Pick one",
          header: "Choice",
          options: [
            { label: "A", description: "Option A" },
            { label: "B", description: "Option B" },
          ],
        }],
        context: [],
      }, { Authorization: "Bearer testsecret123" });
      assert.equal(res.status, 200);
      assert.equal(sentMessages.length, 1);
      assert.ok(sentMessages[0].text.includes("❓"));
    });

    it("should handle session.idle event", async () => {
      const res = await req("/event", "POST", {
        type: "session.idle",
        sessionID: "ses1",
        context: [],
        session: { title: "Test Session", project: "myapp" },
        todos: [
          { content: "Task 1", status: "pending", priority: "high" },
        ],
        diff: { files: 2, additions: 15, deletions: 3 },
      }, { Authorization: "Bearer testsecret123" });
      assert.equal(res.status, 200);
      assert.equal(sentMessages.length, 1);
      assert.ok(sentMessages[0].text.includes("⏸️"));
      assert.ok(sentMessages[0].text.includes("Test Session"));
      assert.ok(sentMessages[0].text.includes("Task 1"));
      assert.ok(sentMessages[0].text.includes("add: 15"));
    });

    it("should handle session.error event", async () => {
      const res = await req("/event", "POST", {
        type: "session.error",
        sessionID: "ses1",
        error: { name: "RateLimitError", data: { message: "Too many" } },
        context: [],
      }, { Authorization: "Bearer testsecret123" });
      assert.equal(res.status, 200);
      assert.equal(sentMessages.length, 1);
      assert.ok(sentMessages[0].text.includes("⚠️"));
      assert.ok(sentMessages[0].text.includes("RateLimitError"));
    });

    it("should handle command_result sessions", async () => {
      const res = await req("/event", "POST", {
        type: "command_result",
        commandID: "cmd1",
        command: "sessions",
        chatID: 123456,
        data: [
          { id: "s1", title: "My Session", directory: "/app" },
        ],
      }, { Authorization: "Bearer testsecret123" });
      assert.equal(res.status, 200);
      assert.equal(sentMessages.length, 1);
      assert.ok(sentMessages[0].text.includes("My Session"));
    });

    it("should handle command_result todo", async () => {
      const res = await req("/event", "POST", {
        type: "command_result",
        commandID: "cmd2",
        command: "todo",
        chatID: 123456,
        data: [
          { content: "Fix bug", status: "in_progress", priority: "high" },
        ],
      }, { Authorization: "Bearer testsecret123" });
      assert.equal(res.status, 200);
      assert.equal(sentMessages.length, 1);
      assert.ok(sentMessages[0].text.includes("Fix bug"));
    });
  });

  describe("404", () => {
    it("should return 404 for unknown routes", async () => {
      const res = await req("/unknown");
      assert.equal(res.status, 404);
    });

    it("should return 404 for unsupported methods", async () => {
      const res = await req("/health", "POST");
      assert.equal(res.status, 404);
    });
  });

  describe("response round-trip", () => {
    it("should queue and retrieve responses", async () => {
      const { addResponse } = await import("../bot/state.js");
      addResponse({
        id: "roundtrip1",
        type: "permission_reply",
        requestID: "req1",
        sessionID: "ses1",
        reply: "once",
      });

      const res = await req("/responses", "GET", undefined, {
        Authorization: "Bearer testsecret123",
      });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.ok(res.body.some((r: any) => r.id === "roundtrip1"));

      const del = await req("/responses/roundtrip1", "DELETE", undefined, {
        Authorization: "Bearer testsecret123",
      });
      assert.equal(del.status, 200);
      assert.equal(del.body.ok, true);

      const after = await req("/responses", "GET", undefined, {
        Authorization: "Bearer testsecret123",
      });
      assert.ok(!after.body.some((r: any) => r.id === "roundtrip1"));
    });
  });
});
