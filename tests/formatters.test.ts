import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatPermissionMessage,
  formatQuestionMessage,
  formatSessionIdleMessage,
  formatSessionErrorMessage,
  formatReplyConfirmation,
  formatError,
  formatSessionsList,
  formatTodoResult,
} from "../bot/formatters.js";
import type {
  PermissionEventPayload,
  QuestionEventPayload,
  SessionIdlePayload,
  SessionErrorPayload,
} from "../shared/types.js";

describe("escapeHtml (via formatters)", () => {
  it("should escape HTML entities in permission tool args", () => {
    const payload: PermissionEventPayload = {
      type: "permission.asked",
      requestID: "req1",
      sessionID: "ses1",
      permission: "external_command",
      patterns: [],
      metadata: {
        toolName: "bash",
        toolArgs: '{ "cmd": "echo <script>alert(1)</script>" }',
      },
      always: [],
      context: [],
    };
    const result = formatPermissionMessage(payload);
    assert.ok(!result.includes("<script>"), "Should escape < and >");
    assert.ok(result.includes("&lt;script&gt;"));
  });

  it("should escape & in session title", () => {
    const payload: PermissionEventPayload = {
      type: "permission.asked",
      requestID: "req2",
      sessionID: "ses2",
      permission: "test",
      patterns: [],
      metadata: {},
      always: [],
      context: [],
      session: { title: "Tom & Jerry", project: "test" },
    };
    const result = formatPermissionMessage(payload);
    assert.ok(result.includes("Tom &amp; Jerry"));
  });
});

describe("truncate (via formatters)", () => {
  it("should not truncate short text", () => {
    const payload: SessionIdlePayload = {
      type: "session.idle",
      sessionID: "ses1",
      context: [{ role: "assistant", text: "Short text" }],
      session: { title: "Test", project: "proj" },
    };
    const result = formatSessionIdleMessage(payload);
    assert.ok(result.includes("Test"));
  });
});

describe("sessionHeader", () => {
  it("should return empty string when no title and no project", () => {
    const payload: PermissionEventPayload = {
      type: "permission.asked",
      requestID: "req1",
      sessionID: "ses1",
      permission: "test",
      patterns: [],
      metadata: {},
      always: [],
      context: [],
    };
    const result = formatPermissionMessage(payload);
    assert.ok(!result.includes("💬"));
  });

  it("should show title only when no project", () => {
    const payload: PermissionEventPayload = {
      type: "permission.asked",
      requestID: "req1",
      sessionID: "ses1",
      permission: "test",
      patterns: [],
      metadata: {},
      always: [],
      context: [],
      session: { title: "My Session", project: "My Session" },
    };
    const result = formatPermissionMessage(payload);
    assert.ok(result.includes("💬 My Session"));
  });

  it("should show title and project when both differ", () => {
    const payload: PermissionEventPayload = {
      type: "permission.asked",
      requestID: "req1",
      sessionID: "ses1",
      permission: "test",
      patterns: [],
      metadata: {},
      always: [],
      context: [],
      session: { title: "Bug Fix", project: "myapp" },
    };
    const result = formatPermissionMessage(payload);
    assert.ok(result.includes("💬 Bug Fix"));
    assert.ok(result.includes("📂 myapp"));
  });
});

describe("formatPermissionMessage", () => {
  it("should format basic permission request", () => {
    const payload: PermissionEventPayload = {
      type: "permission.asked",
      requestID: "perm123",
      sessionID: "ses456",
      permission: "external_command",
      patterns: [],
      metadata: { toolName: "bash", toolArgs: '{"cmd":"ls"}' },
      always: [],
      context: [],
    };
    const result = formatPermissionMessage(payload);
    assert.ok(result.includes("🔐 Запрос разрешения"));
    assert.ok(result.includes("bash"));
    assert.ok(result.includes("ls"));
  });

  it("should show permission type when no tool name", () => {
    const payload: PermissionEventPayload = {
      type: "permission.asked",
      requestID: "perm123",
      sessionID: "ses456",
      permission: "external_directory",
      patterns: ["/tmp/test"],
      metadata: {},
      always: [],
      context: [],
    };
    const result = formatPermissionMessage(payload);
    assert.ok(result.includes("external_directory"));
    assert.ok(result.includes("/tmp/test"));
  });

  it("should include context message", () => {
    const payload: PermissionEventPayload = {
      type: "permission.asked",
      requestID: "req1",
      sessionID: "ses1",
      permission: "test",
      patterns: [],
      metadata: {},
      always: [],
      context: [{ role: "assistant", text: "Running tests" }],
    };
    const result = formatPermissionMessage(payload);
    assert.ok(result.includes("Running tests"));
    assert.ok(result.includes("🤖"));
  });

  it("should show user icon for user context", () => {
    const payload: PermissionEventPayload = {
      type: "permission.asked",
      requestID: "req1",
      sessionID: "ses1",
      permission: "test",
      patterns: [],
      metadata: {},
      always: [],
      context: [{ role: "user", text: "Please run tests" }],
    };
    const result = formatPermissionMessage(payload);
    assert.ok(result.includes("👤"));
  });

  it("should skip tool args when empty object", () => {
    const payload: PermissionEventPayload = {
      type: "permission.asked",
      requestID: "req1",
      sessionID: "ses1",
      permission: "test",
      patterns: [],
      metadata: { toolName: "read", toolArgs: "{}" },
      always: [],
      context: [],
    };
    const result = formatPermissionMessage(payload);
    assert.ok(result.includes("read"));
    assert.ok(!result.includes("<pre>"));
  });
});

describe("formatQuestionMessage", () => {
  it("should format question with options", () => {
    const payload: QuestionEventPayload = {
      type: "question.asked",
      requestID: "q1",
      sessionID: "ses1",
      questions: [{
        question: "Which framework?",
        header: "Framework",
        options: [
          { label: "React", description: "UI library" },
          { label: "Vue", description: "Progressive framework" },
        ],
      }],
      context: [],
    };
    const result = formatQuestionMessage(payload);
    assert.ok(result.includes("❓ Вопрос от агента"));
    assert.ok(result.includes("Framework"));
    assert.ok(result.includes("Which framework?"));
    assert.ok(result.includes("React"));
    assert.ok(result.includes("Vue"));
  });

  it("should format question without options", () => {
    const payload: QuestionEventPayload = {
      type: "question.asked",
      requestID: "q2",
      sessionID: "ses1",
      questions: [{
        question: "Enter your name",
        header: "Name",
        options: [],
      }],
      context: [],
    };
    const result = formatQuestionMessage(payload);
    assert.ok(result.includes("Enter your name"));
    assert.ok(!result.includes("1️⃣"));
  });

  it("should include session meta", () => {
    const payload: QuestionEventPayload = {
      type: "question.asked",
      requestID: "q1",
      sessionID: "ses1",
      questions: [{
        question: "Test?",
        header: "Q",
        options: [],
      }],
      context: [],
      session: { title: "Setup", project: "myapp" },
    };
    const result = formatQuestionMessage(payload);
    assert.ok(result.includes("💬 Setup"));
  });
});

describe("formatSessionIdleMessage", () => {
  it("should format basic idle message", () => {
    const payload: SessionIdlePayload = {
      type: "session.idle",
      sessionID: "ses1",
      context: [],
    };
    const result = formatSessionIdleMessage(payload);
    assert.ok(result.includes("⏸️ Сессия остановлена"));
  });

  it("should include diff when files > 0", () => {
    const payload: SessionIdlePayload = {
      type: "session.idle",
      sessionID: "ses1",
      context: [],
      diff: { files: 3, additions: 10, deletions: 5 },
    };
    const result = formatSessionIdleMessage(payload);
    assert.ok(result.includes("Файлов: 3"));
    assert.ok(result.includes("add: 10"));
    assert.ok(result.includes("del: 5"));
  });

  it("should not include diff when files === 0", () => {
    const payload: SessionIdlePayload = {
      type: "session.idle",
      sessionID: "ses1",
      context: [],
      diff: { files: 0, additions: 0, deletions: 0 },
    };
    const result = formatSessionIdleMessage(payload);
    assert.ok(!result.includes("Файлов"));
  });

  it("should include only in_progress todos", () => {
    const payload: SessionIdlePayload = {
      type: "session.idle",
      sessionID: "ses1",
      context: [],
      todos: [
        { content: "Fix bug", status: "in_progress", priority: "high" },
        { content: "Write tests", status: "pending", priority: "medium" },
        { content: "Deploy", status: "completed", priority: "low" },
        { content: "Cancelled task", status: "cancelled", priority: "low" },
      ],
    };
    const result = formatSessionIdleMessage(payload);
    assert.ok(result.includes("📋 Задачи"));
    assert.ok(result.includes("🔄 Fix bug"));
    assert.ok(!result.includes("Write tests"));
    assert.ok(!result.includes("Deploy"));
    assert.ok(!result.includes("Cancelled task"));
  });

  it("should not show todos section when only non-active todos exist", () => {
    const payload: SessionIdlePayload = {
      type: "session.idle",
      sessionID: "ses1",
      context: [],
      todos: [
        { content: "Done task", status: "completed", priority: "low" },
      ],
    };
    const result = formatSessionIdleMessage(payload);
    assert.ok(!result.includes("📋"));
  });

  it("should not include todos when empty array", () => {
    const payload: SessionIdlePayload = {
      type: "session.idle",
      sessionID: "ses1",
      context: [],
      todos: [],
    };
    const result = formatSessionIdleMessage(payload);
    assert.ok(!result.includes("📋"));
  });
});

describe("formatSessionErrorMessage", () => {
  it("should format error with all details", () => {
    const payload: SessionErrorPayload = {
      type: "session.error",
      sessionID: "ses1",
      error: { name: "RateLimitError", data: { message: "Too many requests" } },
      context: [],
    };
    const result = formatSessionErrorMessage(payload);
    assert.ok(result.includes("⚠️ Ошибка сессии"));
    assert.ok(result.includes("RateLimitError"));
    assert.ok(result.includes("Too many requests"));
  });

  it("should handle error with name", () => {
    const payload: SessionErrorPayload = {
      type: "session.error",
      error: { name: "Unknown", data: {} },
      context: [],
    };
    const result = formatSessionErrorMessage(payload);
    assert.ok(result.includes("Unknown"));
    assert.ok(result.includes("No details available"));
  });

  it("should handle missing error object", () => {
    const payload: SessionErrorPayload = {
      type: "session.error",
      context: [],
    };
    const result = formatSessionErrorMessage(payload);
    assert.ok(result.includes("Unknown Error"));
    assert.ok(result.includes("No details available"));
  });
});

describe("formatReplyConfirmation", () => {
  it("should format confirmation", () => {
    const result = formatReplyConfirmation("test action");
    assert.ok(result.includes("✅"));
    assert.ok(result.includes("test action"));
  });
});

describe("formatError", () => {
  it("should format error message", () => {
    const result = formatError("Something went wrong");
    assert.ok(result.includes("❌"));
    assert.ok(result.includes("Something went wrong"));
  });
});

describe("formatSessionsList", () => {
  it("should show empty state", () => {
    const result = formatSessionsList(null);
    assert.ok(result.includes("Нет активных сессий"));
  });

  it("should show empty array", () => {
    const result = formatSessionsList([]);
    assert.ok(result.includes("Нет активных сессий"));
  });

  it("should format sessions with title", () => {
    const data = [
      { id: "s1", title: "Bug Fix", directory: "/home/app", time: { created: Date.now() - 30_000, updated: Date.now() } },
    ];
    const result = formatSessionsList(data);
    assert.ok(result.includes("Bug Fix"));
    assert.ok(result.includes("1."));
  });

  it("should use directory name when no title", () => {
    const data = [
      { id: "s1", directory: "/home/user/myproject", time: { created: Date.now(), updated: Date.now() } },
    ];
    const result = formatSessionsList(data);
    assert.ok(result.includes("myproject"));
  });

  it("should limit to 10 sessions", () => {
    const data = Array.from({ length: 15 }, (_, i) => ({
      id: `s${i}`,
      title: `Session ${i}`,
      time: { created: Date.now(), updated: Date.now() },
    }));
    const result = formatSessionsList(data);
    assert.ok(result.includes("(15)"));
    assert.ok(!result.includes("Session 11"));
  });

  it("should show time ago for recent session", () => {
    const data = [
      { id: "s1", title: "Test", time: { created: Date.now() - 5_000, updated: Date.now() } },
    ];
    const result = formatSessionsList(data);
    assert.ok(result.includes("только что"));
  });

  it("should show minutes ago", () => {
    const data = [
      { id: "s1", title: "Test", time: { created: Date.now() - 300_000, updated: Date.now() } },
    ];
    const result = formatSessionsList(data);
    assert.ok(result.includes("5 мин назад"));
  });

  it("should show hours ago", () => {
    const data = [
      { id: "s1", title: "Test", time: { created: Date.now() - 7_200_000, updated: Date.now() } },
    ];
    const result = formatSessionsList(data);
    assert.ok(result.includes("2 ч назад"));
  });

  it("should show days ago", () => {
    const data = [
      { id: "s1", title: "Test", time: { created: Date.now() - 172_800_000, updated: Date.now() } },
    ];
    const result = formatSessionsList(data);
    assert.ok(result.includes("2 д назад"));
  });
});

describe("formatTodoResult", () => {
  it("should show empty state", () => {
    assert.ok(formatTodoResult(null).includes("Нет задач"));
    assert.ok(formatTodoResult([]).includes("Нет задач"));
  });

  it("should format todos with status icons and priorities", () => {
    const todos = [
      { content: "Critical task", status: "in_progress", priority: "high" },
      { content: "Normal task", status: "pending", priority: "medium" },
      { content: "Low task", status: "completed", priority: "low" },
    ];
    const result = formatTodoResult(todos);
    assert.ok(result.includes("🔄 🔴 Critical task"));
    assert.ok(result.includes("⬜ 🟡 Normal task"));
    assert.ok(result.includes("✅ 🟢 Low task"));
    assert.ok(result.includes("Todo (3)"));
  });

  it("should handle unknown status", () => {
    const todos = [
      { content: "Weird task", status: "unknown_status", priority: "high" },
    ];
    const result = formatTodoResult(todos);
    assert.ok(result.includes("⬜"));
    assert.ok(result.includes("Weird task"));
  });
});
