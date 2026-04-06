// src/utils/logger.ts
import * as vscode from 'vscode';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'off';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3, off: 99 };

let outputChannel: vscode.OutputChannel | null = null;
let currentLevel: LogLevel = 'info';

export function initLogger(channel: vscode.OutputChannel): void {
  outputChannel = channel;
  refreshLevel();
}

export function refreshLevel(): void {
  const cfg = vscode.workspace.getConfiguration('localCodeAgent');
  currentLevel = (cfg.get<LogLevel>('logLevel')) ?? 'info';
}

function log(level: LogLevel, ...args: unknown[]): void {
  if (LEVELS[level] < LEVELS[currentLevel]) return;
  const msg = `[${level.toUpperCase()}] ${args.map(String).join(' ')}`;
  outputChannel?.appendLine(msg);
  if (level === 'error') console.error(msg);
}

export const logger = {
  debug: (...a: unknown[]) => log('debug', ...a),
  info:  (...a: unknown[]) => log('info',  ...a),
  warn:  (...a: unknown[]) => log('warn',  ...a),
  error: (...a: unknown[]) => log('error', ...a),
};
