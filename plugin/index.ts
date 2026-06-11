type ClientSession = {
  messages(opts: { path: { id: string }; query?: { limit?: number } }): Promise<{ data?: unknown }>;
  message(opts: { path: { id: string; messageID: string } }): Promise<{ data?: unknown }>;
  prompt(opts: { body?: { parts: Array<{ type: string; text: string }> }; path: { id: string } }): Promise<{ data?: unknown }>;
  get(opts: { path: { id: string } }): Promise<{ data?: unknown }>;
  list(opts?: { query?: { limit?: number } }): Promise<{ data?: unknown }>;
  todo(opts: { path: { id: string } }): Promise<{ data?: unknown }>;
  diff(opts: { path: { id: string } }): Promise<{ data?: unknown }>;
};

type PluginInput = {
  client: {
    session: ClientSession;
    postSessionIdPermissionsPermissionId(opts: {
      body: { response: "once" | "always" | "reject" };
      path: { id: string; permissionID: string };
    }): Promise<{ data?: unknown }>;
    tui: {
      showToast(opts: { body: { message: string; variant: "info" | "success" | "warning" | "error" } }): Promise<{ data?: unknown }>;
    };
  };
  project: { id: string; name?: string };
  worktree: string;
  directory: string;
  serverUrl: URL;
};

type PluginOpts = {
  botUrl?: string;
  secret?: string;
};

import { appendFileSync } from "fs";

const LOG_FILE = process.env.TG_BRIDGE_LOG || "/tmp/tg-bridge.log";

function log(msg: string, ...args: unknown[]) {
  try {
    const ts = new Date().toISOString();
    const line = args.length > 0 ? `${ts} ${msg} ${args.map(a => JSON.stringify(a)).join(" ")}\n` : `${ts} ${msg}\n`;
    appendFileSync(LOG_FILE, line);
  } catch {}
}

function logError(msg: string, ...args: unknown[]) {
  try {
    const ts = new Date().toISOString();
    const line = args.length > 0 ? `${ts} ERROR ${msg} ${args.map(a => JSON.stringify(a)).join(" ")}\n` : `${ts} ERROR ${msg}\n`;
    appendFileSync(LOG_FILE, line);
  } catch {}
}

export const server = async (input: PluginInput, options?: PluginOpts) => {
  log("Plugin loader invoked");
  try {
    const result = await _server(input, options);
    log("Plugin initialized successfully, returning hooks:", Object.keys(result));
    return result;
  } catch (err) {
    logError("Plugin init FATAL:", err instanceof Error ? err.message : String(err));
    logError("Stack:", err instanceof Error ? err.stack : "n/a");
    return {};
  }
};

export default server;

async function _server(input: PluginInput, options?: PluginOpts) {
  const { client, project, serverUrl, worktree } = input;

  log("Input received:", {
    projectId: project.id,
    projectName: project.name,
    worktree,
    directory: input.directory,
    serverUrl: serverUrl.toString(),
  });
  log("Options received:", JSON.stringify(options));

  const POLL_INTERVAL_MS = 2000;
  const RETRY_ATTEMPTS = 3;
  const RETRY_DELAY_MS = 500;
  const MAX_CONTEXT_MESSAGES = 3;

  const baseUrl = (options?.botUrl || "http://localhost:3456")
    .replace(/\/event$/, "")
    .replace(/\/$/, "");
  const botEventUrl = `${baseUrl}/event`;
  const botResponsesUrl = `${baseUrl}/responses`;
  const secret = options?.secret || "";

  log("Bot URLs:", { botEventUrl, botResponsesUrl });
  log("Auth configured:", secret ? `yes (${secret.slice(0, 8)}...)` : "no");

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers["Authorization"] = `Bearer ${secret}`;

  const status = {
    connected: false,
    lastPollAt: 0,
    lastError: "",
    pollCount: 0,
    responseCount: 0,
  };

  const sessionCache = new Map<string, { title: string; project: string; fetchedAt: number }>();
  const SESSION_CACHE_TTL = 60_000;

  async function getSessionMeta(sessionID: string): Promise<{ title: string; project: string } | undefined> {
    const cached = sessionCache.get(sessionID);
    if (cached && Date.now() - cached.fetchedAt < SESSION_CACHE_TTL) return cached;

    try {
      const resp = await client.session.get({ path: { id: sessionID } });
      const data = resp?.data as { title?: string; directory?: string } | undefined;
      if (data) {
        const dirName = data.directory?.split("/").pop() || project.name || project.id;
        const meta = { title: data.title || dirName, project: dirName, fetchedAt: Date.now() };
        sessionCache.set(sessionID, meta);
        return meta;
      }
    } catch (err) {
      logError(`getSessionMeta session=${sessionID.slice(0, 8)}... error:`, err instanceof Error ? err.message : String(err));
    }
    return undefined;
  }

  async function getSessionTodos(sessionID: string) {
    try {
      const resp = await client.session.todo({ path: { id: sessionID } });
      const data = resp?.data as Array<{ content: string; status: string; priority: string }> | undefined;
      return data || [];
    } catch (err) {
      logError(`getSessionTodos session=${sessionID.slice(0, 8)}... error:`, err instanceof Error ? err.message : String(err));
      return [];
    }
  }

  async function getSessionDiff(sessionID: string) {
    try {
      const resp = await client.session.diff({ path: { id: sessionID } });
      const data = resp?.data as { additions?: number; deletions?: number; files?: number } | undefined;
      return data;
    } catch (err) {
      logError(`getSessionDiff session=${sessionID.slice(0, 8)}... error:`, err instanceof Error ? err.message : String(err));
      return undefined;
    }
  }

  async function postToBot(payload: Record<string, unknown>): Promise<boolean> {
    const payloadType = payload.type;
    log(`POST /event type=${payloadType} payload=${JSON.stringify(payload).slice(0, 1000)}`);
    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
      try {
        const t0 = Date.now();
        const response = await fetch(botEventUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        const elapsed = Date.now() - t0;
        if (response.ok) {
          log(`POST /event type=${payloadType} -> ${response.status} (${elapsed}ms)`);
          return true;
        }
        const body = await response.text().catch(() => "");
        logError(`POST /event type=${payloadType} -> ${response.status} (${elapsed}ms): ${body}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logError(`POST /event type=${payloadType} attempt ${attempt + 1}/${RETRY_ATTEMPTS} failed: ${msg}`);
      }
      if (attempt < RETRY_ATTEMPTS - 1) {
        const delay = RETRY_DELAY_MS * (attempt + 1);
        log(`POST /event retry in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    return false;
  }

  async function fetchContext(sessionID: string) {
    try {
      const response = await client.session.messages({
        path: { id: sessionID },
        query: { limit: MAX_CONTEXT_MESSAGES },
      });
      if (!response?.data) {
        log(`fetchContext session=${sessionID.slice(0, 8)}... -> no data`);
        return [];
      }
      const messages = response.data as Array<{ info?: { role: string }; parts?: Array<{ type: string; text?: string }> }>;
      const result: Array<{ role: string; text: string }> = [];
      for (const msg of messages) {
        for (const part of msg.parts || []) {
          if (part.type === "text" && part.text) {
            result.push({
              role: (msg.info?.role || "assistant"),
              text: part.text.slice(0, 500),
            });
          }
        }
      }
      const ctx = result.slice(-MAX_CONTEXT_MESSAGES);
      log(`fetchContext session=${sessionID.slice(0, 8)}... -> ${ctx.length} messages`);
      return ctx;
    } catch (err) {
      logError(`fetchContext session=${sessionID.slice(0, 8)}... error:`, err instanceof Error ? err.message : String(err));
      return [];
    }
  }

  async function processResponse(resp: Record<string, any>) {
    log(`Processing response id=${resp.id} type=${resp.type}`);
    try {
      switch (resp.type) {
        case "permission_reply":
          log(`  -> permission ${resp.requestID}: ${resp.reply}`);
          try {
            await client.postSessionIdPermissionsPermissionId({
              body: { response: resp.reply },
              path: { id: resp.sessionID, permissionID: resp.requestID },
            });
            log(`  -> permission reply OK`);
          } catch (err) {
            logError(`  -> permission reply error:`, err instanceof Error ? err.message : String(err));
          }
          break;
        case "question_reply":
          log(`  -> question ${resp.requestID}:`, JSON.stringify(resp.answers));
          try {
            await client.session.prompt({
              body: { parts: [{ type: "text", text: resp.answers.flat().join(", ") }] },
              path: { id: resp.sessionID },
            });
            log(`  -> question reply OK`);
          } catch (err) {
            logError(`  -> question reply error:`, err instanceof Error ? err.message : String(err));
          }
          break;
        case "question_reject":
          log(`  -> reject question ${resp.requestID} session=${resp.sessionID}`);
          try {
            await client.session.prompt({
              body: { parts: [{ type: "text", text: "Question rejected by user via Telegram" }] },
              path: { id: resp.sessionID },
            });
            log(`  -> question reject OK`);
          } catch (err) {
            logError(`  -> question reject error:`, err instanceof Error ? err.message : String(err));
          }
          break;
        case "session_prompt":
          log(`  -> session ${resp.sessionID}: "${resp.text?.slice(0, 100)}"`);
          try {
            await client.session.prompt({
              body: { parts: [{ type: "text", text: resp.text }] },
              path: { id: resp.sessionID },
            });
            log(`  -> session prompt OK`);
          } catch (err) {
            logError(`  -> session prompt error:`, err instanceof Error ? err.message : String(err));
          }
          break;
        case "command":
          log(`  -> command ${resp.command} chatID=${resp.chatID}`);
          try {
            let resultData: unknown = null;
            if (resp.command === "sessions") {
              const listResp = await client.session.list({ query: { limit: 10 } });
              const items = listResp?.data as Array<Record<string, unknown>> | undefined;
              resultData = (items || []).map((s) => ({
                id: s.id,
                title: s.title,
                directory: s.directory,
                time: s.time,
              }));
            } else if (resp.command === "todo" && resp.sessionID) {
              resultData = await getSessionTodos(resp.sessionID);
            }
            await postToBot({
              type: "command_result",
              commandID: resp.id,
              command: resp.command,
              chatID: resp.chatID,
              data: resultData,
            });
            log(`  -> command ${resp.command} result sent OK`);
          } catch (err) {
            logError(`  -> command ${resp.command} error:`, err instanceof Error ? err.message : String(err));
            await postToBot({
              type: "command_result",
              commandID: resp.id,
              command: resp.command,
              chatID: resp.chatID,
              data: null,
            });
          }
          break;
        default:
          logError(`  -> unknown response type: ${resp.type}`);
      }
    } catch (err) {
      logError(`processResponse id=${resp.id} error:`, err instanceof Error ? err.message : String(err));
    }
  }

  log("Plugin v2 loaded (API paths: /session/{id}/permissions/{permId})");
  try {
    log("Registering with bot...");
    const registered = await postToBot({
      type: "register",
      serverUrl: serverUrl.toString(),
      project: { id: project.id, name: project.name, directory: worktree },
    });
    if (registered) {
      status.connected = true;
      log("Registration successful, bot is reachable");
    } else {
      logError("Registration FAILED — bot unreachable after all retries");
    }
  } catch (err) {
    logError("Registration exception:", err instanceof Error ? err.message : String(err));
  }

  log(`Starting polling loop (interval=${POLL_INTERVAL_MS}ms)`);
  setInterval(async () => {
    try {
      const t0 = Date.now();
      const res = await fetch(botResponsesUrl, { headers });
      const elapsed = Date.now() - t0;

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        if (status.connected) {
          status.connected = false;
          status.lastError = `HTTP ${res.status}`;
          logError(`GET /responses -> ${res.status} (${elapsed}ms): ${body.slice(0, 200)} — marking disconnected`);
        }
        return;
      }

      if (!status.connected) {
        status.connected = true;
        status.lastError = "";
        log("Connection RESTORED");
      }

      status.lastPollAt = Date.now();
      status.pollCount++;

      const responses = await res.json() as Array<Record<string, any>>;
      if (!Array.isArray(responses) || responses.length === 0) return;

      log(`GET /responses -> ${responses.length} response(s) (${elapsed}ms)`);

      for (const resp of responses) {
        status.responseCount++;

        try {
          const ackUrl = `${botResponsesUrl}/${resp.id}`;
          const ackRes = await fetch(ackUrl, { method: "DELETE", headers });
          log(`DELETE /responses/${resp.id} -> ${ackRes.status}`);
        } catch (err) {
          logError(`DELETE /responses/${resp.id} failed:`, err instanceof Error ? err.message : String(err));
        }

        await processResponse(resp);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (status.connected) {
        status.connected = false;
        status.lastError = msg;
        logError(`Poll error (marking disconnected): ${msg}`);
      }
    }
  }, POLL_INTERVAL_MS);

  return {
    tool: {
      telegram_status: {
        description: "Telegram Bridge status: connection state, poll count, responses processed",
        args: {},
        async execute() {
          const state = status.connected ? "Connected" : `Disconnected (${status.lastError})`;
          const result = `Telegram Bridge: ${state}\nPolls: ${status.pollCount} | Responses: ${status.responseCount} | Last poll: ${new Date(status.lastPollAt).toISOString()}`;
          log(`telegram_status tool called -> ${result}`);
          return result;
        },
      },
    },
    event: async ({ event }: { event: { type: string; properties: Record<string, any> } }) => {
      log(`Event received: type=${event.type}`);
      try {
        const p = event.properties;
        switch (event.type) {
          case "permission.asked": {
            let toolName = "";
            let toolArgs = "";
            if (p.tool?.messageID && p.sessionID) {
              try {
                const msgResp = await client.session.message({
                  path: { id: p.sessionID, messageID: p.tool.messageID },
                });
                const msgData = msgResp?.data as { parts?: Array<{ type: string; toolCall?: { name?: string; arguments?: string } }> } | undefined;
                if (msgData?.parts) {
                  for (const part of msgData.parts) {
                    if (part.type === "tool-call" && part.toolCall) {
                      toolName = part.toolCall.name || "";
                      const rawArgs = part.toolCall.arguments || "";
                      try { toolArgs = JSON.stringify(JSON.parse(rawArgs), null, 2).slice(0, 2000); } catch { toolArgs = rawArgs.slice(0, 2000); }
                    }
                  }
                }
              } catch (err) {
                log(`  fetch tool message: ${err instanceof Error ? err.message : String(err)}`);
              }
            }
            const [ctx, sessionMeta] = await Promise.all([
              fetchContext(p.sessionID),
              getSessionMeta(p.sessionID),
            ]);
            const ok = await postToBot({
              type: "permission.asked",
              requestID: p.id,
              sessionID: p.sessionID,
              permission: p.permission,
              patterns: p.patterns,
              metadata: { ...p.metadata, toolName, toolArgs },
              always: p.always,
              context: ctx,
              session: sessionMeta,
            });
            log(`  permission.asked sent to bot: ${ok ? "OK" : "FAILED"}`);
            break;
          }
          case "question.asked": {
            const qCount = p.questions?.length || 0;
            log(`  question.asked: id=${p.id} session=${p.sessionID?.slice(0, 8)}... questions=${qCount}`);
            const [ctx, sessionMeta] = await Promise.all([
              fetchContext(p.sessionID),
              getSessionMeta(p.sessionID),
            ]);
            const mapped = (p.questions || []).map((q: Record<string, any>) => ({
              question: q.question,
              header: q.header,
              options: q.options,
              multiple: q.multiple,
              custom: q.custom,
            }));
            const ok = await postToBot({
              type: "question.asked",
              requestID: p.id,
              sessionID: p.sessionID,
              questions: mapped,
              context: ctx,
              session: sessionMeta,
            });
            log(`  question.asked sent to bot: ${ok ? "OK" : "FAILED"}`);
            break;
          }
          case "session.idle": {
            log(`  session.idle: session=${p.sessionID?.slice(0, 8)}...`);
            const [ctx, sessionMeta, todos, diff] = await Promise.all([
              fetchContext(p.sessionID),
              getSessionMeta(p.sessionID),
              getSessionTodos(p.sessionID),
              getSessionDiff(p.sessionID),
            ]);
            const ok = await postToBot({
              type: "session.idle",
              sessionID: p.sessionID,
              context: ctx,
              session: sessionMeta,
              todos: todos.length > 0 ? todos : undefined,
              diff: diff,
              duration: p.duration,
            });
            log(`  session.idle sent to bot: ${ok ? "OK" : "FAILED"}`);
            break;
          }
          case "session.error": {
            const sid = p.sessionID;
            log(`  session.error: session=${sid?.slice(0, 8) || "n/a"}... error=${p.error?.name || "unknown"}`);
            const [ctx, sessionMeta] = await Promise.all([
              sid ? fetchContext(sid) : Promise.resolve([]),
              sid ? getSessionMeta(sid) : Promise.resolve(undefined),
            ]);
            const ok = await postToBot({
              type: "session.error",
              sessionID: sid,
              error: p.error
                ? { name: p.error.name, data: p.error.data }
                : undefined,
              context: ctx,
              session: sessionMeta,
            });
            log(`  session.error sent to bot: ${ok ? "OK" : "FAILED"}`);
            break;
          }
          default:
            log(`  Unhandled event type: ${event.type}`);
        }
      } catch (err) {
        logError(`Event handler error for ${event.type}:`, err instanceof Error ? err.message : String(err));
      }
    },
  };
}
