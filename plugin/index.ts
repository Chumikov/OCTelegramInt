import type { PluginEvent, ContextMessage, BotResponse } from "../shared/types.js";

const MAX_CONTEXT_MESSAGES = 3;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;
const POLL_INTERVAL_MS = 2000;
const TOAST_DEBOUNCE_MS = 30000;

type PluginInput = {
  client: {
    session: {
      messages(opts: { sessionID: string; limit: number }): Promise<{ data?: unknown }>;
    };
    tui: {
      showToast(params: {
        title?: string;
        message: string;
        variant: "info" | "success" | "warning" | "error";
        duration?: number;
      }): Promise<unknown>;
    };
  };
  project: { id: string; name?: string; worktree: string };
  serverUrl: URL;
};

type PluginOptions = {
  botUrl?: string;
  secret?: string;
};

type Hooks = {
  event?: (input: { event: { type: string; properties: any } }) => Promise<void>;
  tool?: Record<string, any>;
};

const status = {
  connected: false,
  lastPollAt: 0,
  lastError: "",
  pollCount: 0,
  responseCount: 0,
  lastToastAt: 0,
};

async function fetchContextMessages(
  client: PluginInput["client"],
  sessionID: string
): Promise<ContextMessage[]> {
  try {
    const response = await client.session.messages({
      sessionID,
      limit: MAX_CONTEXT_MESSAGES,
    });
    if (!response.data) return [];
    const messages = response.data as Array<{
      info: { role: string };
      parts: Array<{ type: string; text?: string }>;
    }>;
    const result: ContextMessage[] = [];
    for (const msg of messages) {
      for (const part of msg.parts) {
        if (part.type === "text" && part.text) {
          result.push({
            role: msg.info.role as "user" | "assistant",
            text: part.text.slice(0, 500),
          });
        }
      }
    }
    return result.slice(-MAX_CONTEXT_MESSAGES);
  } catch {
    return [];
  }
}

async function callOpenCodeApi(
  serverUrl: string,
  method: string,
  path: string,
  body?: unknown
): Promise<boolean> {
  try {
    const res = await fetch(`${serverUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      console.error(`[plugin] API call ${method} ${path} failed: ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[plugin] API call ${method} ${path} error:`, err);
    return false;
  }
}

async function processResponse(response: BotResponse, serverUrl: string): Promise<void> {
  switch (response.type) {
    case "permission_reply":
      await callOpenCodeApi(
        serverUrl,
        "POST",
        `/permission/${response.requestID}/reply`,
        { reply: response.reply }
      );
      break;

    case "question_reply":
      await callOpenCodeApi(
        serverUrl,
        "POST",
        `/question/${response.requestID}/reply`,
        { answers: response.answers }
      );
      break;

    case "question_reject":
      await callOpenCodeApi(
        serverUrl,
        "POST",
        `/question/${response.requestID}/reject`
      );
      break;

    case "session_prompt":
      await callOpenCodeApi(
        serverUrl,
        "POST",
        `/session/${response.sessionID}/chat`,
        { parts: [{ type: "text", text: response.text }] }
      );
      break;
  }
}

async function maybeToast(
  client: PluginInput["client"],
  message: string,
  variant: "info" | "success" | "warning" | "error"
): Promise<void> {
  const now = Date.now();
  if (now - status.lastToastAt < TOAST_DEBOUNCE_MS) return;
  status.lastToastAt = now;
  try {
    await client.tui.showToast({
      title: "Telegram Bridge",
      message,
      variant,
      duration: 4000,
    });
  } catch {}
}

export default async function TelegramBridgePlugin(
  { client, project, serverUrl }: PluginInput,
  options?: PluginOptions
): Promise<Hooks> {
  const baseUrl = (options?.botUrl || "http://localhost:3456").replace(/\/event$/, "").replace(/\/$/, "");
  const botEventUrl = `${baseUrl}/event`;
  const botResponsesUrl = `${baseUrl}/responses`;
  const secret = options?.secret || "";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (secret) {
    headers["Authorization"] = `Bearer ${secret}`;
  }

  async function postToBot(payload: PluginEvent): Promise<boolean> {
    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(botEventUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        if (response.ok) return true;
        console.error(`[plugin] Bot returned ${response.status}: ${await response.text()}`);
      } catch (err) {
        console.error(`[plugin] Failed to reach bot (attempt ${attempt + 1}/${RETRY_ATTEMPTS}):`, err);
      }
      if (attempt < RETRY_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
      }
    }
    return false;
  }

  const registered = await postToBot({
    type: "register",
    serverUrl: serverUrl.toString(),
    project: { id: project.id, name: project.name, directory: project.worktree },
  });

  if (registered) {
    status.connected = true;
    await maybeToast(client, "✅ Подключено к Telegram боту", "success");
  }

  const pollTimer = setInterval(async () => {
    try {
      const res = await fetch(botResponsesUrl, { headers });
      if (!res.ok) {
        if (status.connected) {
          status.connected = false;
          status.lastError = `HTTP ${res.status}`;
          await maybeToast(client, "❌ Бот недоступен", "error");
        }
        return;
      }

      if (!status.connected) {
        status.connected = true;
        status.lastError = "";
        await maybeToast(client, "⚠️ Подключение восстановлено", "warning");
      }

      status.lastPollAt = Date.now();
      status.pollCount++;

      const responses: BotResponse[] = await res.json();
      if (!Array.isArray(responses) || responses.length === 0) return;

      for (const resp of responses) {
        status.responseCount++;
        await processResponse(resp, serverUrl.toString());

        await fetch(`${botResponsesUrl}/${resp.id}`, {
          method: "DELETE",
          headers,
        }).catch(() => {});
      }
    } catch (err) {
      if (status.connected) {
        status.connected = false;
        status.lastError = String(err);
        await maybeToast(client, "❌ Бот недоступен", "error");
      }
    }
  }, POLL_INTERVAL_MS);

  const toolDef = {
    description: "Telegram Bridge status: connection state, poll count, responses processed",
    args: {},
    async execute(): Promise<string> {
      const state = status.connected ? "✅ Connected" : `❌ Disconnected (${status.lastError})`;
      return `Telegram Bridge: ${state}\nPolls: ${status.pollCount} | Responses delivered: ${status.responseCount} | Last poll: ${new Date(status.lastPollAt).toISOString()}`;
    },
  };

  return {
    tool: { telegram_status: toolDef },
    event: async ({ event }) => {
      switch (event.type) {
        case "permission.asked": {
          const ctx = await fetchContextMessages(client, event.properties.sessionID);
          await postToBot({
            type: "permission.asked",
            requestID: event.properties.id,
            sessionID: event.properties.sessionID,
            permission: event.properties.permission,
            patterns: event.properties.patterns,
            metadata: event.properties.metadata,
            always: event.properties.always,
            context: ctx,
          });
          break;
        }
        case "question.asked": {
          const ctx = await fetchContextMessages(client, event.properties.sessionID);
          await postToBot({
            type: "question.asked",
            requestID: event.properties.id,
            sessionID: event.properties.sessionID,
            questions: event.properties.questions.map((q: any) => ({
              question: q.question,
              header: q.header,
              options: q.options,
              multiple: q.multiple,
              custom: q.custom,
            })),
            context: ctx,
          });
          break;
        }
        case "session.idle": {
          const ctx = await fetchContextMessages(client, event.properties.sessionID);
          await postToBot({
            type: "session.idle",
            sessionID: event.properties.sessionID,
            context: ctx,
          });
          break;
        }
        case "session.error": {
          const sid = event.properties.sessionID;
          const ctx = sid ? await fetchContextMessages(client, sid) : [];
          await postToBot({
            type: "session.error",
            sessionID: sid,
            error: event.properties.error
              ? {
                  name: event.properties.error.name,
                  data: event.properties.error.data as { message?: string } | undefined,
                }
              : undefined,
            context: ctx,
          });
          break;
        }
      }
    },
  };
}
