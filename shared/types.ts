export interface SessionMeta {
  title: string;
  project: string;
}

export interface TodoItem {
  content: string;
  status: string;
  priority: string;
}

export interface DiffSummary {
  files: number;
  additions: number;
  deletions: number;
}

export interface PermissionEventPayload {
  type: "permission.asked";
  requestID: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  metadata: Record<string, unknown>;
  always: string[];
  context: ContextMessage[];
  session?: SessionMeta;
}

export interface QuestionEventPayload {
  type: "question.asked";
  requestID: string;
  sessionID: string;
  questions: Array<{
    question: string;
    header: string;
    options: Array<{ label: string; description: string }>;
    multiple?: boolean;
    custom?: boolean;
  }>;
  context: ContextMessage[];
  session?: SessionMeta;
}

export interface SessionIdlePayload {
  type: "session.idle";
  sessionID: string;
  context: ContextMessage[];
  session?: SessionMeta;
  todos?: TodoItem[];
  diff?: DiffSummary;
  duration?: number;
}

export interface SessionErrorPayload {
  type: "session.error";
  sessionID?: string;
  error?: {
    name: string;
    data?: { message?: string };
  };
  context: ContextMessage[];
  session?: SessionMeta;
}

export interface RegistrationPayload {
  type: "register";
  serverUrl: string;
  project: {
    id: string;
    name?: string;
    directory: string;
  };
}

export type PluginEvent =
  | PermissionEventPayload
  | QuestionEventPayload
  | SessionIdlePayload
  | SessionErrorPayload
  | RegistrationPayload
  | CommandResultPayload;

export interface ContextMessage {
  role: "user" | "assistant";
  text: string;
}

export interface PendingRequest {
  type: "permission" | "question" | "session_idle" | "session_error";
  requestID: string;
  sessionID: string;
  telegramMessageID: number;
  chatID: number;
  payload: PluginEvent;
  createdAt: number;
}

export interface BotResponsePermission {
  id: string;
  type: "permission_reply";
  requestID: string;
  sessionID: string;
  reply: "once" | "always" | "reject";
}

export interface BotResponseQuestionReply {
  id: string;
  type: "question_reply";
  requestID: string;
  sessionID: string;
  answers: string[][];
}

export interface BotResponseQuestionReject {
  id: string;
  type: "question_reject";
  requestID: string;
  sessionID: string;
}

export interface BotResponseSessionPrompt {
  id: string;
  type: "session_prompt";
  sessionID: string;
  text: string;
}

export interface BotResponseCommand {
  id: string;
  type: "command";
  command: "sessions" | "todo";
  sessionID?: string;
  chatID: number;
}

export type BotResponse =
  | BotResponsePermission
  | BotResponseQuestionReply
  | BotResponseQuestionReject
  | BotResponseSessionPrompt
  | BotResponseCommand;

export interface CommandResultPayload {
  type: "command_result";
  commandID: string;
  command: "sessions" | "todo";
  chatID: number;
  data: unknown;
}
