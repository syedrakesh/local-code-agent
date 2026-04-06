// src/extension.ts
import * as vscode from 'vscode';
import { ChatViewProvider } from './views/ChatViewProvider';
import { OllamaApiProvider } from './providers/llm/OllamaApiProvider';
import { WorkspaceContextService } from './services/WorkspaceContextService';
import { PromptBuilderService } from './services/PromptBuilderService';
import { ChatSessionService } from './services/ChatSessionService';
import { PatchService } from './services/PatchService';
import { TerminalApprovalService } from './services/TerminalApprovalService';
import { DiagnosticsService } from './services/DiagnosticsService';
import { registerCommands } from './commands';
import { initLogger, logger } from './utils/logger';

export function activate(context: vscode.ExtensionContext): void {
  // ── Logger ────────────────────────────────────────────────────────────────
  const outputChannel = vscode.window.createOutputChannel('Local Code Agent');
  context.subscriptions.push(outputChannel);
  initLogger(outputChannel);
  logger.info('Local Code Agent activating…');

  // ── Config ────────────────────────────────────────────────────────────────
  const cfg = vscode.workspace.getConfiguration('localCodeAgent');
  const baseUrl: string = cfg.get('ollama.baseUrl') ?? 'http://localhost:11434';
  const model: string = cfg.get('ollama.model') ?? 'gemma4:e2b';

  // ── Services ──────────────────────────────────────────────────────────────
  const ollamaProvider = new OllamaApiProvider(baseUrl, model);
  const contextSvc = new WorkspaceContextService();
  const promptBuilder = new PromptBuilderService(contextSvc);
  const sessions = new ChatSessionService(context.workspaceState);
  const patchSvc = new PatchService(contextSvc);
  const terminalSvc = new TerminalApprovalService();
  const diagnosticsSvc = new DiagnosticsService(ollamaProvider);

  // Dispose terminal service on deactivate
  context.subscriptions.push({ dispose: () => terminalSvc.dispose() });

  // ── Chat View Provider ────────────────────────────────────────────────────
  const chatViewProvider = new ChatViewProvider(
    context.extensionUri,
    sessions,
    contextSvc,
    promptBuilder,
    patchSvc,
    terminalSvc,
    diagnosticsSvc,
    ollamaProvider
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.viewType,
      chatViewProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // ── Commands ──────────────────────────────────────────────────────────────
  registerCommands(context, chatViewProvider, contextSvc, promptBuilder, diagnosticsSvc, sessions);

  // ── Config change handler ─────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('localCodeAgent.ollama.model')) {
        const newModel: string = vscode.workspace.getConfiguration('localCodeAgent').get('ollama.model') ?? model;
        ollamaProvider.setModel(newModel);
        logger.info('Model updated to:', newModel);
      }
      if (e.affectsConfiguration('localCodeAgent.ollama.baseUrl')) {
        const newUrl: string = vscode.workspace.getConfiguration('localCodeAgent').get('ollama.baseUrl') ?? baseUrl;
        ollamaProvider.setBaseUrl(newUrl);
        logger.info('Base URL updated to:', newUrl);
      }
    })
  );

  // ── Startup health check (non-blocking) ───────────────────────────────────
  ollamaProvider.healthCheck().then(status => {
    if (!status.reachable) {
      vscode.window.showWarningMessage(
        `Local Code Agent: Ollama is not reachable at ${baseUrl}. Run "Local Code Agent: Check Backend" for details.`,
        'Check Backend'
      ).then(choice => {
        if (choice === 'Check Backend') {
          vscode.commands.executeCommand('localCodeAgent.checkBackend');
        }
      });
    } else {
      logger.info(`Ollama reachable. Model: ${status.model}. Available: ${status.availableModels.join(', ')}`);
    }
  }).catch(err => {
    logger.warn('Startup health check failed:', err);
  });

  logger.info('Local Code Agent activated.');
}

export function deactivate(): void {
  logger.info('Local Code Agent deactivated.');
}
