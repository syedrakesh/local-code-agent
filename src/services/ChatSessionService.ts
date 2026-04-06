// src/services/ChatSessionService.ts
import * as vscode from 'vscode';
import { ChatSession, ChatMessage, MessageRole } from '../models';
import { generateId } from '../utils/helpers';
import { logger } from '../utils/logger';

const SESSION_STORAGE_KEY = 'localCodeAgent.sessions';

export class ChatSessionService {
  private sessions: Map<string, ChatSession> = new Map();
  private activeSessionId: string | null = null;

  constructor(private readonly storage: vscode.Memento) {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const raw = this.storage.get<ChatSession[]>(SESSION_STORAGE_KEY, []);
      for (const s of raw) {
        this.sessions.set(s.id, s);
      }
      logger.info(`Loaded ${this.sessions.size} sessions from storage.`);
    } catch (err) {
      logger.error('Failed to load sessions:', err);
    }
  }

  private async saveToStorage(): Promise<void> {
    try {
      await this.storage.update(SESSION_STORAGE_KEY, Array.from(this.sessions.values()));
    } catch (err) {
      logger.error('Failed to save sessions:', err);
    }
  }

  getAllSessions(): ChatSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getSession(id: string): ChatSession | undefined {
    return this.sessions.get(id);
  }

  getActiveSession(): ChatSession | undefined {
    if (this.activeSessionId) return this.sessions.get(this.activeSessionId);
    // Return most recent session
    const all = this.getAllSessions();
    if (all.length > 0) {
      this.activeSessionId = all[0].id;
      return all[0];
    }
    return undefined;
  }

  setActiveSession(id: string): void {
    this.activeSessionId = id;
  }

  async createSession(workspaceUri: string, title?: string): Promise<ChatSession> {
    const id = generateId();
    const session: ChatSession = {
      id,
      workspaceUri,
      title: title ?? 'New Chat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };
    this.sessions.set(id, session);
    this.activeSessionId = id;
    await this.saveToStorage();
    logger.info('Created session:', id);
    return session;
  }

  async addMessage(
    sessionId: string,
    role: MessageRole,
    content: string,
    meta?: Record<string, unknown>
  ): Promise<ChatMessage> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    const msg: ChatMessage = {
      id: generateId(),
      role,
      content,
      timestamp: Date.now(),
      meta,
    };
    session.messages.push(msg);
    session.updatedAt = Date.now();

    // Auto-title from first user message
    if (role === 'user' && session.title === 'New Chat' && session.messages.filter(m => m.role === 'user').length === 1) {
      session.title = content.slice(0, 60).replace(/\n/g, ' ').trim();
    }

    await this.saveToStorage();
    return msg;
  }

  async updateLastAssistantMessage(sessionId: string, content: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const last = [...session.messages].reverse().find(m => m.role === 'assistant');
    if (last) {
      last.content = content;
      session.updatedAt = Date.now();
      await this.saveToStorage();
    }
  }

  async renameSession(id: string, title: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;
    session.title = title;
    session.updatedAt = Date.now();
    await this.saveToStorage();
  }

  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
    if (this.activeSessionId === id) {
      this.activeSessionId = null;
    }
    await this.saveToStorage();
  }

  exportSession(id: string): string {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Session not found: ${id}`);
    return JSON.stringify(session, null, 2);
  }

  /** Get the last N user+assistant turns as LLM messages (for context). */
  getHistoryMessages(sessionId: string, maxTurns = 10): { role: 'user' | 'assistant'; content: string }[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return session.messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-maxTurns * 2)
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  }
}
