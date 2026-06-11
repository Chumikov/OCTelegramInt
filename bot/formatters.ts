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

function sessionHeader(title: string | undefined, project: string | undefined): string {
  const t = title || "Без названия";
  const p = project ? `\n📂 ${escapeHtml(project)}` : "";
  return `💬 ${escapeHtml(t)}${p}`;
}

function formatContextShort(context: ContextMessage[]): string {
  if (context.length === 0) return "";
  const last = context[context.length - 1];
  const icon = last.role === "user" ? "👤" : "🤖";
  const text = last.text.length > 200 ? last.text.slice(0, 200) + "..." : last.text;
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
  return `📝 Файлов: ${diff.files} (+${diff.additions}/-${diff.deletions})`;
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
      const truncated = toolArgs.length > 400 ? toolArgs.slice(0, 400) + "..." : toolArgs;
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

  const lastAssistantMsg = payload.context
    .filter((m) => m.role === "assistant")
    .pop();
  if (lastAssistantMsg) {
    const snippet = lastAssistantMsg.text.slice(0, 200);
    parts.push(`\n💬 <i>${escapeHtml(snippet)}</i>`);
  }

  if (payload.diff) {
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
