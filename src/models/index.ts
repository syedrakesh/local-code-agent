// src/models/index.ts
// ──────────────────────────────────────────────────────────────────────────────
// Shared data types used across the entire extension.
// ──────────────────────────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  /** Optional metadata — e.g. files referenced, tool results, etc. */
  meta?: Record<string, unknown>;
}

export interface ChatSession {
  id: string;
  workspaceUri: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

// ──────────────────────────────────────────────────────────────────────────────
// LLM Provider types
// ──────────────────────────────────────────────────────────────────────────────

export interface LLMOptions {
  temperature?: number;
  topP?: number;
  numPredict?: number;
  keepAlive?: string;
  system?: string;
}

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMProvider {
  chat(messages: LLMMessage[], options?: LLMOptions): Promise<string>;
  streamChat(
    messages: LLMMessage[],
    options: LLMOptions,
    onToken: (token: string) => void,
    signal?: AbortSignal
  ): Promise<void>;
  healthCheck(): Promise<HealthStatus>;
  listModels(): Promise<string[]>;
}

export interface HealthStatus {
  reachable: boolean;
  model: string;
  availableModels: string[];
  error?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Patch / Edit types
// ──────────────────────────────────────────────────────────────────────────────

export type EditOperation = 'replace' | 'insert' | 'delete' | 'create' | 'rename';

export interface FileEdit {
  /** Workspace-relative or absolute path */
  filePath: string;
  operation: EditOperation;
  /** For replace/insert: the new content */
  newContent?: string;
  /** For replace/delete: zero-based start line */
  startLine?: number;
  /** For replace/delete: zero-based end line (inclusive) */
  endLine?: number;
  /** For rename: new path */
  newPath?: string;
  /** Human-readable explanation of this edit */
  description?: string;
}

export interface PatchProposal {
  id: string;
  summary: string;
  edits: FileEdit[];
  sessionId: string;
  timestamp: number;
  status: 'pending' | 'accepted' | 'rejected';
}

// ──────────────────────────────────────────────────────────────────────────────
// Terminal types
// ──────────────────────────────────────────────────────────────────────────────

export interface TerminalCommand {
  id: string;
  command: string;
  cwd: string;
  riskNote: string;
  sessionId: string;
  status: 'pending' | 'approved' | 'rejected' | 'running' | 'done' | 'error';
  output?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Workspace context
// ──────────────────────────────────────────────────────────────────────────────

export interface WorkspaceContext {
  rootPath: string;
  fileTree: string;
  openFiles: string[];
  activeFile?: string;
  selectedText?: string;
  selectedRange?: { startLine: number; endLine: number };
  gitStatus?: string;
  manifests: Record<string, string>;
  readme?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Webview message protocol (extension ↔ webview)
// ──────────────────────────────────────────────────────────────────────────────

export type ExtensionToWebview =
  | { type: 'init'; sessions: ChatSession[]; activeSessionId: string | null; models: string[]; currentModel: string; workspaceRoot: string }
  | { type: 'sessionUpdate'; session: ChatSession }
  | { type: 'streamToken'; token: string; sessionId: string }
  | { type: 'streamDone'; sessionId: string }
  | { type: 'streamError'; error: string; sessionId: string }
  | { type: 'patchProposal'; proposal: PatchProposal }
  | { type: 'terminalCommand'; command: TerminalCommand }
  | { type: 'terminalOutput'; commandId: string; output: string }
  | { type: 'healthStatus'; status: HealthStatus }
  | { type: 'modelList'; models: string[] }
  | { type: 'workingState'; state: WorkingState; label: string }
  | { type: 'sessions'; sessions: ChatSession[] }
  | { type: 'error'; message: string };

export type WorkingState =
  | 'idle'
  | 'reading-files'
  | 'scanning-workspace'
  | 'generating'
  | 'preparing-diff'
  | 'waiting-approval'
  | 'running-command';

export type WebviewToExtension =
  | { type: 'sendMessage'; content: string; sessionId: string; includeCurrentFile: boolean; includeSelection: boolean; includeOpenTabs: boolean }
  | { type: 'newChat' }
  | { type: 'selectSession'; sessionId: string }
  | { type: 'deleteSession'; sessionId: string }
  | { type: 'renameSession'; sessionId: string; title: string }
  | { type: 'stopGeneration' }
  | { type: 'acceptPatch'; proposalId: string }
  | { type: 'rejectPatch'; proposalId: string }
  | { type: 'approveCommand'; commandId: string; alwaysAllow: boolean }
  | { type: 'rejectCommand'; commandId: string }
  | { type: 'checkBackend' }
  | { type: 'changeModel'; model: string }
  | { type: 'scanWorkspace' }
  | { type: 'exportSession'; sessionId: string }
  | { type: 'ready' };
