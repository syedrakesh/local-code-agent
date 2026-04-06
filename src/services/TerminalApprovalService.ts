// src/services/TerminalApprovalService.ts
import * as vscode from 'vscode';
import { TerminalCommand } from '../models';
import { logger } from '../utils/logger';
import { generateId } from '../utils/helpers';

export class TerminalApprovalService {
  private pendingCommands: Map<string, TerminalCommand> = new Map();
  private alwaysAllowedCommands: Set<string> = new Set();
  private terminal: vscode.Terminal | null = null;
  private outputBuffer: Map<string, string> = new Map();

  /** Parse terminal command blocks from an assistant response. */
  parseCommandFromResponse(response: string, sessionId: string): TerminalCommand | null {
    const termBlockRe = /```terminal\s*([\s\S]*?)\s*```/i;
    const match = termBlockRe.exec(response);
    if (!match) return null;

    try {
      const parsed = JSON.parse(match[1]);
      if (!parsed.command) return null;

      const cmd: TerminalCommand = {
        id: generateId(),
        command: parsed.command,
        cwd: parsed.cwd ?? '.',
        riskNote: parsed.riskNote ?? 'No risk assessment provided.',
        sessionId,
        status: 'pending',
      };
      this.pendingCommands.set(cmd.id, cmd);
      return cmd;
    } catch (err) {
      logger.warn('Failed to parse terminal block:', err);
      return null;
    }
  }

  getCommand(id: string): TerminalCommand | undefined {
    return this.pendingCommands.get(id);
  }

  /** Check whether a command is in the always-allow list for this session. */
  isAlwaysAllowed(command: string): boolean {
    return this.alwaysAllowedCommands.has(command);
  }

  /** Mark command as always allowed for this session. */
  alwaysAllow(command: string): void {
    this.alwaysAllowedCommands.add(command);
    logger.info('Always allowing command:', command);
  }

  /** Execute an approved command; returns stdout/stderr. */
  async executeCommand(commandId: string, workspaceRoot: string): Promise<string> {
    const cmd = this.pendingCommands.get(commandId);
    if (!cmd) throw new Error(`Command not found: ${commandId}`);

    const cfg = vscode.workspace.getConfiguration('localCodeAgent');
    const enableTerminal: boolean = cfg.get('enableTerminalExecution') ?? true;
    if (!enableTerminal) {
      throw new Error('Terminal execution is disabled in settings.');
    }

    cmd.status = 'running';

    const cwd = cmd.cwd === '.' ? workspaceRoot : cmd.cwd;

    return new Promise<string>((resolve, reject) => {
      const { exec } = require('child_process');
      const child = exec(cmd.command, { cwd, timeout: 30_000 }, (error: Error | null, stdout: string, stderr: string) => {
        const output = [stdout, stderr].filter(Boolean).join('\n').trim();
        cmd.output = output;
        cmd.status = error ? 'error' : 'done';
        logger.info(`Command [${cmd.command}] exited. Output: ${output.slice(0, 200)}`);
        resolve(output);
      });

      // Also show in VS Code terminal for visibility
      this.getOrCreateTerminal().sendText(`# Local Code Agent running: ${cmd.command}`);

      child.on('error', (err: Error) => {
        cmd.status = 'error';
        reject(err);
      });
    });
  }

  private getOrCreateTerminal(): vscode.Terminal {
    if (!this.terminal || this.terminal.exitStatus !== undefined) {
      this.terminal = vscode.window.createTerminal({ name: 'Local Code Agent' });
    }
    return this.terminal;
  }

  rejectCommand(commandId: string): void {
    const cmd = this.pendingCommands.get(commandId);
    if (cmd) cmd.status = 'rejected';
  }

  dispose(): void {
    this.terminal?.dispose();
  }
}
