import type {
  PermissionEventPayload,
  QuestionEventPayload,
  SessionIdlePayload,
  SessionErrorPayload,
  ContextMessage,
} from "../shared/types.js";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatContext(context: ContextMessage[]): string {
  if (context.length === 0) return "";
  const lines = context.map((m) => {
    const icon = m.role === "user" ? "👤" : "🤖";
    const truncated = m.text.length > 300 ? m.text.slice(0, 300) + "..." : m.text;
    return `${icon} <i>${escapeHtml(truncated)}</i>`;
  });
  return `\n\n<b>📋 Контекст:</b>\n${lines.join("\n")}`;
}

export function formatPermissionMessage(payload: PermissionEventPayload): string {
  const meta = (payload.metadata || {}) as Record<string, unknown>;
  const permType = payload.permission || "unknown";
  const sessionSlice = payload.sessionID ? payload.sessionID.slice(0, 8) : "unknown";
  const toolName = (meta.toolName as string) || "";
  const toolArgs = (meta.toolArgs as string) || "";
  const ctxBlock = formatContext(payload.context || []);

  const parts: string[] = [`<b>🔐 Запрос разрешения</b>`, ``];

  if (toolName) {
    parts.push(`🔧 <b>Инструмент:</b> <code>${escapeHtml(toolName)}</code>`);
  }
  parts.push(`📂 <b>Тип:</b> <code>${escapeHtml(permType)}</code>`);

  if (payload.patterns?.length) {
    parts.push(`📁 <b>Пути:</b> <code>${escapeHtml(payload.patterns.join(", "))}</code>`);
  }

  if (toolArgs && toolArgs !== "{}") {
    const truncated = toolArgs.length > 500 ? toolArgs.slice(0, 500) + "..." : toolArgs;
    parts.push(`📝 <b>Аргументы:</b>\n<pre>${escapeHtml(truncated)}</pre>`);
  }

  parts.push(`📋 <b>Сессия:</b> <code>${escapeHtml(sessionSlice)}</code>`);
  parts.push(ctxBlock);

  return parts.join("\n");
}

export function formatQuestionMessage(payload: QuestionEventPayload): string {
  const parts: string[] = [`<b>❓ Вопрос от агента</b>`];

  for (let i = 0; i < payload.questions.length; i++) {
    const q = payload.questions[i];
    parts.push(``, `<b>📋 ${escapeHtml(q.header)}</b>`, escapeHtml(q.question));

    if (q.options.length > 0) {
      parts.push(``);
      for (let j = 0; j < q.options.length; j++) {
        const opt = q.options[j];
        parts.push(`${j + 1}️⃣ <b>${escapeHtml(opt.label)}</b> — ${escapeHtml(opt.description)}`);
      }
    }
  }

  parts.push(formatContext(payload.context));

  return parts.join("\n");
}

export function formatSessionIdleMessage(payload: SessionIdlePayload): string {
  const ctxBlock = formatContext(payload.context);
  const lastAssistantMsg = payload.context
    .filter((m) => m.role === "assistant")
    .pop();

  let reason = "Сессия перешла в состояние ожидания";
  if (lastAssistantMsg) {
    const snippet = lastAssistantMsg.text.slice(0, 200);
    reason += `\n💬 <i>${escapeHtml(snippet)}</i>`;
  }

  return [`<b>⏸️ Сессия остановлена</b>`, ``, reason, `📋 <b>Сессия:</b> <code>${escapeHtml(payload.sessionID.slice(0, 8))}</code>`, ctxBlock].join("\n");
}

export function formatSessionErrorMessage(payload: SessionErrorPayload): string {
  const errorName = payload.error?.name || "Unknown Error";
  const errorMsg = payload.error?.data?.message || "No details available";
  const sid = payload.sessionID || "unknown";
  const ctxBlock = formatContext(payload.context);

  return [
    `<b>⚠️ Ошибка сессии</b>`,
    ``,
    `🔴 <b>Тип:</b> ${escapeHtml(errorName)}`,
    `💬 <b>Сообщение:</b> ${escapeHtml(errorMsg)}`,
    `📋 <b>Сессия:</b> <code>${escapeHtml(sid.slice(0, 8))}</code>`,
    ctxBlock,
  ].join("\n");
}

export function formatReplyConfirmation(action: string): string {
  return `✅ <b>Ответ отправлен:</b> ${escapeHtml(action)}`;
}

export function formatError(text: string): string {
  return `❌ <b>Ошибка:</b> ${escapeHtml(text)}`;
}
