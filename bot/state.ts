import type { PendingRequest, BotResponse } from "../shared/types.js";
import { config } from "../config.js";

const pending = new Map<string, PendingRequest>();
const responses = new Map<string, BotResponse>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function addPending(request: PendingRequest): void {
  pending.set(request.requestID, request);
}

export function getPending(requestID: string): PendingRequest | undefined {
  return pending.get(requestID);
}

export function removePending(requestID: string): boolean {
  return pending.delete(requestID);
}

export function addResponse(response: BotResponse): void {
  responses.set(response.id, response);
  console.log(`[state] Response queued: ${response.type} (${response.id})`);
}

export function getAllResponses(): BotResponse[] {
  return Array.from(responses.values());
}

export function ackResponse(id: string): boolean {
  return responses.delete(id);
}

export function startCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, req] of pending) {
      if (now - req.createdAt > config.requestTTL) {
        pending.delete(id);
      }
    }
  }, config.cleanupInterval);
}

export function stopCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
