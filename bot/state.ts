import type { PendingRequest } from "../shared/types.js";
import { config } from "../config.js";

const pending = new Map<string, PendingRequest>();
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

export function findByTelegramMessage(messageID: number, chatID: number): PendingRequest | undefined {
  for (const req of pending.values()) {
    if (req.telegramMessageID === messageID && req.chatID === chatID) {
      return req;
    }
  }
  return undefined;
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

export function pendingCount(): number {
  return pending.size;
}
