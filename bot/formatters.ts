import type {
  PermissionEventPayload,
  QuestionEventPayload,
  SessionIdlePayload,
  SessionErrorPayload,
  ContextMessage,
  TodoItem,
  DiffSummary,
} from "../shared/types.js";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function truncate(text: string | undefined | null, max: number): string {
  if (!text) return "";
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut) + "…";
}

function sessionHeader(title: string | undefined, project: string | undefined): string {
  if (!title && !project) return "";
  const t = title || project || "";
  const p = project && title ? `\n📂 ${escapeHtml(project)}` : "";
  return `💬 ${escapeHtml(t)}${p}`;
}

function formatContextShort(context: ContextMessage[]): string {
  if (context.length === 0) return "";
  const last = context[context.length - 1];
  const icon = last.role === "user" ? "👤" : "🤖";
  const text = truncate(last.text, 200);
  return `${icon} <i>${escapeHtml(text)}</i>`;
}

function formatTodoList(todos: TodoItem[]): string {
  if (todos.length === 0) return "";
  const statusIcons: Record<string, string> = {
    completed: "✅",
    in_progress: "🔄",
    pending: "⬜",
    cancelled: "❌",
  };
  const lines = todos.map((t) => {
    const icon = statusIcons[t.status] || "⬜";
    return `${icon} ${escapeHtml(t.content)}`;
  });
  return `\n\n<b>📋 Задачи:</b>\n${lines.join("\n")}`;
}

function formatDiffSummary(diff: DiffSummary): string {
  return `📝 Файлов: ${diff.files} (add: ${diff.additions} / del: ${diff.deletions})`;
}

export function formatPermissionMessage(payload: PermissionEventPayload): string {
  const meta = (payload.metadata || {}) as Record<string, unknown>;
  const toolName = (meta.toolName as string) || "";
  const toolArgs = (meta.toolArgs as string) || "";
  const permType = payload.permission || "unknown";

  const parts: string[] = [
    `<b>🔐 Запрос разрешения</b>`,
    sessionHeader(payload.session?.title, payload.session?.project),
  ];

  if (toolName) {
    parts.push(`\n🔧 <code>${escapeHtml(toolName)}</code>`);
    if (toolArgs && toolArgs !== "{}") {
      const truncated = truncate(toolArgs, 400);
      parts.push(`<pre>${escapeHtml(truncated)}</pre>`);
    }
  } else {
    parts.push(`\n📂 <b>Тип:</b> <code>${escapeHtml(permType)}</code>`);
    if (payload.patterns?.length) {
      parts.push(`📁 <code>${escapeHtml(payload.patterns.join(", "))}</code>`);
    }
  }

  const lastMsg = formatContextShort(payload.context || []);
  if (lastMsg) {
    parts.push(`\n${lastMsg}`);
  }

  return parts.join("\n");
}

export function formatQuestionMessage(payload: QuestionEventPayload): string {
  const parts: string[] = [
    `<b>❓ Вопрос от агента</b>`,
    sessionHeader(payload.session?.title, payload.session?.project),
  ];

  for (let i = 0; i < payload.questions.length; i++) {
    const q = payload.questions[i];
    parts.push(`\n<b>${escapeHtml(q.header)}</b>`);
    parts.push(escapeHtml(q.question));

    if (q.options.length > 0) {
      for (let j = 0; j < q.options.length; j++) {
        const opt = q.options[j];
        parts.push(`${j + 1}️⃣ <b>${escapeHtml(opt.label)}</b> — ${escapeHtml(opt.description)}`);
      }
    }
  }

  const lastMsg = formatContextShort(payload.context || []);
  if (lastMsg) {
    parts.push(`\n${lastMsg}`);
  }

  return parts.join("\n");
}

export function formatSessionIdleMessage(payload: SessionIdlePayload): string {
  const parts: string[] = [
    `<b>⏸️ Сессия остановлена</b>`,
    sessionHeader(payload.session?.title, payload.session?.project),
  ];

  if (payload.diff && payload.diff.files > 0) {
    parts.push(`\n${formatDiffSummary(payload.diff)}`);
  }

  if (payload.todos && payload.todos.length > 0) {
    parts.push(formatTodoList(payload.todos));
  }

  return parts.join("\n");
}

export function formatSessionErrorMessage(payload: SessionErrorPayload): string {
  const errorName = payload.error?.name || "Unknown Error";
  const errorMsg = payload.error?.data?.message || "No details available";

  const parts: string[] = [
    `<b>⚠️ Ошибка сессии</b>`,
    sessionHeader(payload.session?.title, payload.session?.project),
    `\n🔴 <b>${escapeHtml(errorName)}</b>`,
    `💬 ${escapeHtml(errorMsg)}`,
  ];

  const lastMsg = formatContextShort(payload.context || []);
  if (lastMsg) {
    parts.push(`\n${lastMsg}`);
  }

  return parts.join("\n");
}

export function formatReplyConfirmation(action: string): string {
  return `✅ <b>Ответ отправлен:</b> ${escapeHtml(action)}`;
}

export function formatError(text: string): string {
  return `❌ <b>Ошибка:</b> ${escapeHtml(text)}`;
}

export function formatSessionsList(data: unknown): string {
  const sessions = data as Array<{ id: string; title?: string; directory?: string; time?: { created: number; updated: number } }> | null;
  if (!sessions || !Array.isArray(sessions) || sessions.length === 0) {
    return "📋 <b>Сессии</b>\n\nНет активных сессий";
  }
  const lines = sessions.slice(0, 10).map((s, i) => {
    const title = s.title || s.directory?.split("/").pop() || "Без названия";
    const ago = s.time?.created ? timeAgo(s.time.created) : "";
    return `${i + 1}. ${escapeHtml(title)}${ago ? ` (${ago})` : ""}`;
  });
  return `📋 <b>Сессии (${sessions.length})</b>\n\n${lines.join("\n")}`;
}

export function formatTodoResult(data: unknown): string {
  const todos = data as Array<{ content: string; status: string; priority: string }> | null;
  if (!todos || !Array.isArray(todos) || todos.length === 0) {
    return "📋 <b>Todo</b>\n\nНет задач";
  }
  const statusIcons: Record<string, string> = {
    completed: "✅",
    in_progress: "🔄",
    pending: "⬜",
    cancelled: "❌",
  };
  const lines = todos.map((t) => {
    const icon = statusIcons[t.status] || "⬜";
    const prio = t.priority === "high" ? "🔴" : t.priority === "medium" ? "🟡" : "🟢";
    return `${icon} ${prio} ${escapeHtml(t.content)}`;
  });
  return `📋 <b>Todo (${todos.length})</b>\n\n${lines.join("\n")}`;
}

function timeAgo(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return "только что";
  if (sec < 3600) return `${Math.floor(sec / 60)} мин назад`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} ч назад`;
  return `${Math.floor(sec / 86400)} д назад`;
}
