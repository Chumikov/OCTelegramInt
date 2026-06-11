import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.TELEGRAM_BOT_TOKEN = "0000000000:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
process.env.ALLOWED_CHAT_ID = "123456";

const { addPending, getPending, removePending, addResponse, getAllResponses, ackResponse, startCleanup, stopCleanup } = await import("../bot/state.js");

beforeEach(() => {
  for (const r of getAllResponses()) ackResponse(r.id);
});

describe("pending requests", () => {
  it("should add and get a pending request", () => {
    const req = {
      type: "permission" as const,
      requestID: "req1",
      sessionID: "ses1",
      telegramMessageID: 42,
      chatID: 123,
      payload: { type: "permission.asked" } as any,
      createdAt: Date.now(),
    };
    addPending(req);
    const got = getPending("req1");
    assert.deepEqual(got, req);
  });

  it("should return undefined for non-existent request", () => {
    assert.equal(getPending("nonexistent"), undefined);
  });

  it("should remove a pending request", () => {
    const req = {
      type: "question" as const,
      requestID: "req2",
      sessionID: "ses2",
      telegramMessageID: 43,
      chatID: 123,
      payload: {} as any,
      createdAt: Date.now(),
    };
    addPending(req);
    assert.ok(getPending("req2"));
    const removed = removePending("req2");
    assert.equal(removed, true);
    assert.equal(getPending("req2"), undefined);
  });

  it("should return false when removing non-existent", () => {
    assert.equal(removePending("ghost"), false);
  });

  it("should overwrite on duplicate requestID", () => {
    const req1 = {
      type: "permission" as const,
      requestID: "dup",
      sessionID: "ses1",
      telegramMessageID: 1,
      chatID: 100,
      payload: {} as any,
      createdAt: 1000,
    };
    const req2 = {
      type: "question" as const,
      requestID: "dup",
      sessionID: "ses2",
      telegramMessageID: 2,
      chatID: 200,
      payload: {} as any,
      createdAt: 2000,
    };
    addPending(req1);
    addPending(req2);
    const got = getPending("dup")!;
    assert.equal(got.sessionID, "ses2");
    assert.equal(got.type, "question");
  });
});

describe("responses", () => {
  it("should add and retrieve all responses", () => {
    const resp = {
      id: "resp1",
      type: "permission_reply" as const,
      requestID: "req1",
      sessionID: "ses1",
      reply: "once" as const,
    };
    addResponse(resp);
    const all = getAllResponses();
    assert.ok(all.some(r => r.id === "resp1"));
  });

  it("should ack (delete) a response", () => {
    const resp = {
      id: "resp2",
      type: "session_prompt" as const,
      sessionID: "ses1",
      text: "continue",
    };
    addResponse(resp);
    assert.ok(ackResponse("resp2"));
    assert.ok(!getAllResponses().some(r => r.id === "resp2"));
  });

  it("should return false when acking non-existent", () => {
    assert.equal(ackResponse("ghost"), false);
  });

  it("should handle multiple responses", () => {
    for (let i = 0; i < 5; i++) {
      addResponse({
        id: `multi${i}`,
        type: "permission_reply",
        requestID: `r${i}`,
        sessionID: "ses1",
        reply: "once",
      });
    }
    assert.equal(getAllResponses().filter(r => r.id.startsWith("multi")).length, 5);
    ackResponse("multi2");
    assert.equal(getAllResponses().filter(r => r.id.startsWith("multi")).length, 4);
  });
});

describe("cleanup", () => {
  it("should not crash on start/stop", () => {
    startCleanup();
    stopCleanup();
    startCleanup();
    stopCleanup();
  });

  it("should not duplicate timer", () => {
    startCleanup();
    startCleanup();
    stopCleanup();
  });
});
