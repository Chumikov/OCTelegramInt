import { config } from "../config.js";
import type { ContextMessage } from "../shared/types.js";

let serverUrl: string = config.opencodeServerUrl;

export function registerServer(url: string): void {
  serverUrl = url;
  console.log(`[opencode-client] Registered server: ${serverUrl}`);
}

async function apiRequest(
  method: string,
  path: string,
  body?: unknown
): Promise<Response> {
  const url = `${serverUrl}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (process.env.OPENCODE_SERVER_PASSWORD) {
    const encoded = Buffer.from(`opencode:${process.env.OPENCODE_SERVER_PASSWORD}`).toString("base64");
    headers["Authorization"] = `Basic ${encoded}`;
  }
  return fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function replyPermission(
  requestID: string,
  reply: "once" | "always" | "reject"
): Promise<boolean> {
  try {
    const res = await apiRequest("POST", `/permission/${requestID}/reply`, { reply });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[opencode-client] Permission reply failed (${res.status}): ${text}`);
      return false;
    }
    console.log(`[opencode-client] Permission ${requestID}: ${reply}`);
    return true;
  } catch (err) {
    console.error(`[opencode-client] Failed to reply permission ${requestID}:`, err);
    return false;
  }
}

export async function replyQuestion(
  requestID: string,
  answers: string[][]
): Promise<boolean> {
  try {
    const res = await apiRequest("POST", `/question/${requestID}/reply`, { answers });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[opencode-client] Question reply failed (${res.status}): ${text}`);
      return false;
    }
    console.log(`[opencode-client] Question ${requestID}: replied`);
    return true;
  } catch (err) {
    console.error(`[opencode-client] Failed to reply question ${requestID}:`, err);
    return false;
  }
}

export async function rejectQuestion(requestID: string): Promise<boolean> {
  try {
    const res = await apiRequest("POST", `/question/${requestID}/reject`);
    if (!res.ok) {
      const text = await res.text();
      console.error(`[opencode-client] Question reject failed (${res.status}): ${text}`);
      return false;
    }
    console.log(`[opencode-client] Question ${requestID}: rejected`);
    return true;
  } catch (err) {
    console.error(`[opencode-client] Failed to reject question ${requestID}:`, err);
    return false;
  }
}

export async function sendPrompt(sessionID: string, text: string): Promise<boolean> {
  try {
    const res = await apiRequest("POST", `/session/${sessionID}/chat`, {
      parts: [{ type: "text", text }],
    });
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[opencode-client] Prompt failed (${res.status}): ${errorText}`);
      return false;
    }
    console.log(`[opencode-client] Prompt sent to session ${sessionID}`);
    return true;
  } catch (err) {
    console.error(`[opencode-client] Failed to send prompt to ${sessionID}:`, err);
    return false;
  }
}

export async function fetchSessionMessages(
  sessionID: string,
  limit: number
): Promise<ContextMessage[]> {
  try {
    const res = await apiRequest(
      "GET",
      `/session/${sessionID}/messages?limit=${limit}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    const result: ContextMessage[] = [];
    for (const msg of data) {
      const parts = msg.parts || [];
      for (const part of parts) {
        if (part.type === "text" && part.text) {
          result.push({
            role: (msg.info?.role || msg.role || "assistant") as "user" | "assistant",
            text: part.text.slice(0, 500),
          });
        }
      }
    }
    return result.slice(-limit);
  } catch {
    return [];
  }
}

export function getServerUrl(): string {
  return serverUrl;
}
