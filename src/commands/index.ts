// src/commands/index.ts
import * as vscode from 'vscode';
import { ChatViewProvider } from '../views/ChatViewProvider';
import { WorkspaceContextService } from '../services/WorkspaceContextService';
import { PromptBuilderService, PromptTemplates } from '../services/PromptBuilderService';
import { DiagnosticsService } from '../services/DiagnosticsService';
import { ChatSessionService } from '../services/ChatSessionService';
import { logger } from '../utils/logger';

export function registerCommands(
  context: vscode.ExtensionContext,
  chatView: ChatViewProvider,
  contextSvc: WorkspaceContextService,
  promptBuilder: PromptBuilderService,
  diagnosticsSvc: DiagnosticsService,
  sessions: ChatSessionService
): void {
  const reg = (id: string, fn: () => Promise<void> | void) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, () => {
      Promise.resolve(fn()).catch(err => {
        logger.error(`Command ${id} failed:`, err);
        vscode.window.showErrorMessage(`Local Code Agent: ${err instanceof Error ? err.message : String(err)}`);
      });
    }));

  // ── Open Panel ───────────────────────────────────────────────────────────
  reg('localCodeAgent.openPanel', () => {
    vscode.commands.executeCommand('localCodeAgent.chatView.focus');
  });

  // ── New Chat ─────────────────────────────────────────────────────────────
  reg('localCodeAgent.newChat', async () => {
    const root = contextSvc.getWorkspaceRoot();
    const session = await sessions.createSession(root);
    sessions.setActiveSession(session.id);
    await vscode.commands.executeCommand('localCodeAgent.chatView.focus');
  });

  // ── Ask About Current File ───────────────────────────────────────────────
  reg('localCodeAgent.askAboutFile', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active file.');
      return;
    }
    const filePath = editor.document.uri.fsPath;
    await focusAndSend(
      chatView,
      `Please analyze the file \`${filePath}\` and give a concise summary of what it does.`,
      { includeCurrentFile: true }
    );
  });

  // ── Ask About Selection ──────────────────────────────────────────────────
  reg('localCodeAgent.askAboutSelection', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      vscode.window.showWarningMessage('No text selected.');
      return;
    }
    const selectedText = editor.document.getText(editor.selection);
    const startLine = editor.selection.start.line + 1;
    const filePath = editor.document.uri.fsPath;
    await focusAndSend(
      chatView,
      PromptTemplates.explainCode(selectedText, `${filePath}:${startLine}`),
      { includeSelection: true }
    );
  });

  // ── Explain Current Function ─────────────────────────────────────────────
  reg('localCodeAgent.explainFunction', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { vscode.window.showWarningMessage('No active editor.'); return; }
    const selection = editor.selection.isEmpty
      ? editor.document.lineAt(editor.selection.active.line).text
      : editor.document.getText(editor.selection);
    await focusAndSend(
      chatView,
      `Explain what this code does step by step:\n\n\`\`\`\n${selection}\n\`\`\``,
      { includeCurrentFile: false }
    );
  });

  // ── Propose Fix for Error ────────────────────────────────────────────────
  reg('localCodeAgent.proposeFix', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { vscode.window.showWarningMessage('No active editor.'); return; }

    const diagnostics = promptBuilder.getActiveDiagnostics();
    if (!diagnostics) {
      vscode.window.showInformationMessage('No errors or warnings found in the current file.');
      return;
    }
    await focusAndSend(
      chatView,
      `Fix the following errors/warnings in the current file:\n\n${diagnostics}`,
      { includeCurrentFile: true }
    );
  });

  // ── Refactor Current File ────────────────────────────────────────────────
  reg('localCodeAgent.refactorFile', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { vscode.window.showWarningMessage('No active file.'); return; }
    const filePath = editor.document.uri.fsPath;
    await focusAndSend(
      chatView,
      PromptTemplates.proposeRefactor(editor.document.getText(), filePath),
      { includeCurrentFile: true }
    );
  });

  // ── Review Git Diff ──────────────────────────────────────────────────────
  reg('localCodeAgent.reviewGitDiff', async () => {
    const root = contextSvc.getWorkspaceRoot();
    vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Getting git diff…' },
      async () => {
        const diff = await contextSvc.getGitDiff(root);
        if (!diff) {
          vscode.window.showInformationMessage('No git diff found (nothing staged or no changes).');
          return;
        }
        await focusAndSend(chatView, PromptTemplates.reviewGitDiff(diff));
      }
    );
  });

  // ── Generate Tests ────────────────────────────────────────────────────────
  reg('localCodeAgent.generateTests', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { vscode.window.showWarningMessage('No active file.'); return; }
    const filePath = editor.document.uri.fsPath;
    await focusAndSend(
      chatView,
      PromptTemplates.generateTests(editor.document.getText(), filePath),
      { includeCurrentFile: true }
    );
  });

  // ── Explain Project Structure ────────────────────────────────────────────
  reg('localCodeAgent.explainStructure', async () => {
    const ctx = await contextSvc.gatherContext();
    await focusAndSend(chatView, PromptTemplates.explainStructure(ctx.fileTree));
  });

  // ── Scan Workspace ───────────────────────────────────────────────────────
  reg('localCodeAgent.scanWorkspace', async () => {
    await vscode.commands.executeCommand('localCodeAgent.chatView.focus');
    chatView.postMessage({ type: 'workingState', state: 'scanning-workspace', label: 'Scanning workspace…' });
    const ctx = await contextSvc.gatherContext({ includeOpenTabs: true });
    chatView.postMessage({ type: 'workingState', state: 'idle', label: '' });
    await focusAndSend(chatView, `Summarize the structure and purpose of this workspace based on the following file tree:\n\n${ctx.fileTree}`);
  });

  // ── Check Backend ────────────────────────────────────────────────────────
  reg('localCodeAgent.checkBackend', async () => {
    const status = await diagnosticsSvc.checkBackend();
    await diagnosticsSvc.showDiagnosticsPanel(status);
  });

  // ── Run Approved Command ─────────────────────────────────────────────────
  reg('localCodeAgent.runApprovedCommand', async () => {
    const cmd = await vscode.window.showInputBox({
      prompt: 'Enter command to run (will be shown in approval dialog)',
      placeHolder: 'e.g. npm test',
    });
    if (!cmd) return;
    await focusAndSend(chatView, `Please run the following command: \`${cmd}\``);
  });
}

async function focusAndSend(
  chatView: ChatViewProvider,
  content: string,
  opts: { includeCurrentFile?: boolean; includeSelection?: boolean } = {}
): Promise<void> {
  await vscode.commands.executeCommand('localCodeAgent.chatView.focus');
  await new Promise<void>(r => setTimeout(r, 200));
  await chatView.sendMessageFromCommand(content, opts);
}
