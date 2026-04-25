import type { PluginEvent, ContextMessage } from "../shared/types.js";

const BOT_URL = "http://localhost:3456/event";
const MAX_CONTEXT_MESSAGES = 3;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

type PluginInput = {
  client: {
    session: {
      messages(opts: { sessionID: string; limit: number }): Promise<{
        data?: unknown;
      }>;
    };
  };
  project: { id: string; name?: string; worktree: string };
  serverUrl: URL;
};

type Hooks = {
  event?: (input: { event: { type: string; properties: any } }) => Promise<void>;
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

async function postToBot(payload: PluginEvent): Promise<void> {
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(BOT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) return;
      console.error(
        `[opencode-telegram-plugin] Bot returned ${response.status}: ${await response.text()}`
      );
    } catch (err) {
      console.error(
        `[opencode-telegram-plugin] Failed to reach bot (attempt ${attempt + 1}/${RETRY_ATTEMPTS}):`,
        err
      );
    }
    if (attempt < RETRY_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
    }
  }
}

export default async function TelegramBridgePlugin({
  client,
  project,
  serverUrl,
}: PluginInput): Promise<Hooks> {
  await postToBot({
    type: "register",
    serverUrl: serverUrl.toString(),
    project: { id: project.id, name: project.name, directory: project.worktree },
  });

  return {
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
