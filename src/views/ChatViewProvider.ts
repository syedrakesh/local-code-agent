// src/views/ChatViewProvider.ts
import * as vscode from 'vscode';
import {
  ExtensionToWebview,
  WebviewToExtension,
  PatchProposal,
  TerminalCommand,
  WorkingState,
} from '../models';
import { ChatSessionService } from '../services/ChatSessionService';
import { WorkspaceContextService } from '../services/WorkspaceContextService';
import { PromptBuilderService } from '../services/PromptBuilderService';
import { PatchService } from '../services/PatchService';
import { TerminalApprovalService } from '../services/TerminalApprovalService';
import { DiagnosticsService } from '../services/DiagnosticsService';
import { OllamaApiProvider } from '../providers/llm/OllamaApiProvider';
import { logger } from '../utils/logger';
import { generateId } from '../utils/helpers';
import { getChatHtml } from '../webview/chatHtml';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'localCodeAgent.chatView';

  private _view?: vscode.WebviewView;
  private _abortController: AbortController | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly sessions: ChatSessionService,
    private readonly contextSvc: WorkspaceContextService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly patchSvc: PatchService,
    private readonly terminalSvc: TerminalApprovalService,
    private readonly diagnosticsSvc: DiagnosticsService,
    private readonly provider: OllamaApiProvider
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg: WebviewToExtension) => {
      this.handleWebviewMessage(msg).catch(err => {
        logger.error('Error handling webview message:', err);
        this.postMessage({ type: 'error', message: String(err) });
      });
    });
  }

  private async handleWebviewMessage(msg: WebviewToExtension): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('localCodeAgent');
    const workspaceRoot = this.contextSvc.getWorkspaceRoot();

    switch (msg.type) {
      case 'ready': {
        await this.sendInit();
        break;
      }

      case 'newChat': {
        const session = await this.sessions.createSession(workspaceRoot);
        this.postMessage({ type: 'sessionUpdate', session });
        this.postMessage({ type: 'sessions', sessions: this.sessions.getAllSessions() });
        break;
      }

      case 'selectSession': {
        this.sessions.setActiveSession(msg.sessionId);
        const s = this.sessions.getSession(msg.sessionId);
        if (s) this.postMessage({ type: 'sessionUpdate', session: s });
        break;
      }

      case 'deleteSession': {
        await this.sessions.deleteSession(msg.sessionId);
        this.postMessage({ type: 'sessions', sessions: this.sessions.getAllSessions() });
        break;
      }

      case 'renameSession': {
        await this.sessions.renameSession(msg.sessionId, msg.title);
        this.postMessage({ type: 'sessions', sessions: this.sessions.getAllSessions() });
        break;
      }

      case 'sendMessage': {
        await this.handleSendMessage(msg);
        break;
      }

      case 'stopGeneration': {
        this._abortController?.abort();
        break;
      }

      case 'acceptPatch': {
        if (msg.proposalId.endsWith('__preview')) {
          const realId = msg.proposalId.replace('__preview', '');
          const proposal = this.patchSvc.getProposal(realId);
          if (proposal?.edits[0]) {
            await this.patchSvc.previewEdit(proposal.edits[0]);
          }
          return;
        }
        await this.applyPatch(msg.proposalId);
        break;
      }

      case 'rejectPatch': {
        this.patchSvc.rejectProposal(msg.proposalId);
        break;
      }

      case 'approveCommand': {
        await this.runApprovedCommand(msg.commandId, msg.alwaysAllow, workspaceRoot);
        break;
      }

      case 'rejectCommand': {
        this.terminalSvc.rejectCommand(msg.commandId);
        break;
      }

      case 'checkBackend': {
        this.postMessage({ type: 'workingState', state: 'reading-files' as WorkingState, label: 'Checking backend…' });
        const status = await this.diagnosticsSvc.checkBackend();
        this.postMessage({ type: 'healthStatus', status });
        this.postMessage({ type: 'workingState', state: 'idle' as WorkingState, label: '' });
        await this.diagnosticsSvc.showDiagnosticsPanel(status);
        if (status.availableModels.length > 0) {
          this.postMessage({ type: 'modelList', models: status.availableModels });
        }
        break;
      }

      case 'changeModel': {
        await cfg.update('ollama.model', msg.model, vscode.ConfigurationTarget.Global);
        this.provider.setModel(msg.model);
        logger.info('Model changed to:', msg.model);
        break;
      }

      case 'scanWorkspace': {
        this.postMessage({ type: 'workingState', state: 'scanning-workspace' as WorkingState, label: 'Scanning workspace…' });
        const ctx = await this.contextSvc.gatherContext({ includeOpenTabs: true });
        const activeSession = this.sessions.getActiveSession();
        if (activeSession) {
          await this.sessions.addMessage(activeSession.id, 'system', `Workspace scanned: ${ctx.fileTree.split('\n').length} entries.`);
          const s = this.sessions.getSession(activeSession.id);
          if (s) this.postMessage({ type: 'sessionUpdate', session: s });
        }
        this.postMessage({ type: 'workingState', state: 'idle' as WorkingState, label: '' });
        break;
      }

      case 'exportSession': {
        const json = this.sessions.exportSession(msg.sessionId);
        const doc = await vscode.workspace.openTextDocument({ content: json, language: 'json' });
        await vscode.window.showTextDocument(doc);
        break;
      }
    }
  }

  private async handleSendMessage(msg: Extract<WebviewToExtension, { type: 'sendMessage' }>): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('localCodeAgent');
    const workspaceRoot = this.contextSvc.getWorkspaceRoot();

    // Ensure active session
    let sessionId = msg.sessionId;
    if (!sessionId || !this.sessions.getSession(sessionId)) {
      const s = await this.sessions.createSession(workspaceRoot);
      sessionId = s.id;
      this.sessions.setActiveSession(sessionId);
      this.postMessage({ type: 'sessions', sessions: this.sessions.getAllSessions() });
    }

    // Save user message
    await this.sessions.addMessage(sessionId, 'user', msg.content);
    const session = this.sessions.getSession(sessionId)!;
    this.postMessage({ type: 'sessionUpdate', session });

    this.postMessage({ type: 'workingState', state: 'reading-files' as WorkingState, label: 'Gathering context…' });

    // Gather workspace context
    const ctx = await this.contextSvc.gatherContext({
      includeCurrentFile: msg.includeCurrentFile,
      includeSelection: msg.includeSelection,
      includeOpenTabs: msg.includeOpenTabs,
    });

    this.postMessage({ type: 'workingState', state: 'generating' as WorkingState, label: 'Generating…' });

    // Build LLM messages
    const history = this.sessions.getHistoryMessages(sessionId, 8);
    const llmMessages = await this.promptBuilder.buildMessages(
      history.slice(0, -1), // exclude the just-added user message (it's the last one)
      msg.content,
      ctx,
      {
        includeCurrentFile: msg.includeCurrentFile,
        includeSelection: msg.includeSelection,
        includeOpenTabs: msg.includeOpenTabs,
      }
    );

    // LLM options
    const llmOpts = {
      temperature: cfg.get<number>('ollama.temperature') ?? 0.2,
      topP: cfg.get<number>('ollama.topP') ?? 0.9,
      numPredict: cfg.get<number>('ollama.numPredict') ?? 4096,
      keepAlive: cfg.get<string>('ollama.keepAlive') ?? '5m',
    };

    // Stream response
    this._abortController = new AbortController();
    let fullResponse = '';

    try {
      await this.provider.streamChat(
        llmMessages,
        llmOpts,
        (token) => {
          fullResponse += token;
          this.postMessage({ type: 'streamToken', token, sessionId });
        },
        this._abortController.signal
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg !== 'AbortError') {
        logger.error('Stream error:', err);
        this.postMessage({ type: 'streamError', error: `Failed to get response: ${errMsg}`, sessionId });
      }
    } finally {
      this._abortController = null;
    }

    this.postMessage({ type: 'streamDone', sessionId });

    // Save assistant message
    if (fullResponse) {
      await this.sessions.addMessage(sessionId, 'assistant', fullResponse);
      const updated = this.sessions.getSession(sessionId)!;
      this.postMessage({ type: 'sessionUpdate', session: updated });

      // Parse patches
      const proposal = this.patchSvc.parseEditsFromResponse(fullResponse, sessionId);
      if (proposal) {
        const autoOpen = cfg.get<boolean>('autoOpenDiffPreview') ?? true;
        this.postMessage({ type: 'patchProposal', proposal });
        if (autoOpen && proposal.edits.length === 1) {
          await this.patchSvc.previewEdit(proposal.edits[0]);
        }
      }

      // Parse terminal commands
      const requireApproval = cfg.get<boolean>('requireTerminalApproval') ?? true;
      if (cfg.get<boolean>('enableTerminalExecution') ?? true) {
        const cmd = this.terminalSvc.parseCommandFromResponse(fullResponse, sessionId);
        if (cmd) {
          if (!requireApproval || this.terminalSvc.isAlwaysAllowed(cmd.command)) {
            await this.runApprovedCommand(cmd.id, false, workspaceRoot);
          } else {
            this.postMessage({ type: 'terminalCommand', command: cmd });
          }
        }
      }
    }

    this.postMessage({ type: 'workingState', state: 'idle' as WorkingState, label: '' });
  }

  private async applyPatch(proposalId: string): Promise<void> {
    this.postMessage({ type: 'workingState', state: 'preparing-diff' as WorkingState, label: 'Applying edits…' });

    try {
      const { applied, errors } = await this.patchSvc.applyProposal(proposalId);
      if (errors.length > 0) {
        vscode.window.showWarningMessage(`Applied ${applied} edits with ${errors.length} error(s):\n${errors.join('\n')}`);
      } else {
        vscode.window.showInformationMessage(`✓ Applied ${applied} edit(s) successfully.`);
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to apply edits: ${err instanceof Error ? err.message : String(err)}`);
    }

    this.postMessage({ type: 'workingState', state: 'idle' as WorkingState, label: '' });
  }

  private async runApprovedCommand(commandId: string, alwaysAllow: boolean, workspaceRoot: string): Promise<void> {
    const cmd = this.terminalSvc.getCommand(commandId);
    if (!cmd) return;

    if (alwaysAllow) this.terminalSvc.alwaysAllow(cmd.command);

    this.postMessage({ type: 'workingState', state: 'running-command' as WorkingState, label: `Running: ${cmd.command}` });

    try {
      const output = await this.terminalSvc.executeCommand(commandId, workspaceRoot);
      this.postMessage({ type: 'terminalOutput', commandId, output });

      // Feed output back to chat
      if (output && cmd.sessionId) {
        await this.sessions.addMessage(cmd.sessionId, 'tool', `Command output:\n\`\`\`\n${output}\n\`\`\``);
        const s = this.sessions.getSession(cmd.sessionId);
        if (s) this.postMessage({ type: 'sessionUpdate', session: s });
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Command failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    this.postMessage({ type: 'workingState', state: 'idle' as WorkingState, label: '' });
  }

  private async sendInit(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('localCodeAgent');
    const workspaceRoot = this.contextSvc.getWorkspaceRoot();
    const currentModel: string = cfg.get('ollama.model') ?? 'gemma4:e2b';

    this.provider.setModel(currentModel);
    this.provider.setBaseUrl(cfg.get('ollama.baseUrl') ?? 'http://localhost:11434');

    // Ensure there's at least one session
    let active = this.sessions.getActiveSession();
    if (!active) {
      active = await this.sessions.createSession(workspaceRoot);
    }

    // Try to get model list in background
    const models = await this.provider.listModels().catch(() => []);

    this.postMessage({
      type: 'init',
      sessions: this.sessions.getAllSessions(),
      activeSessionId: active.id,
      models: models.length > 0 ? models : [currentModel],
      currentModel,
      workspaceRoot,
    });
  }

  /** Post a message to the webview. */
  postMessage(msg: ExtensionToWebview): void {
    this._view?.webview.postMessage(msg);
  }

  /** Public helper to inject a user message programmatically (from commands). */
  async sendMessageFromCommand(content: string, opts: {
    includeCurrentFile?: boolean;
    includeSelection?: boolean;
  } = {}): Promise<void> {
    if (!this._view) {
      await vscode.commands.executeCommand('localCodeAgent.chatView.focus');
    }
    // Wait for view to be available
    await new Promise<void>(r => setTimeout(r, 300));

    const workspaceRoot = this.contextSvc.getWorkspaceRoot();
    let active = this.sessions.getActiveSession();
    if (!active) {
      active = await this.sessions.createSession(workspaceRoot);
    }

    await this.handleSendMessage({
      type: 'sendMessage',
      content,
      sessionId: active.id,
      includeCurrentFile: opts.includeCurrentFile ?? false,
      includeSelection: opts.includeSelection ?? false,
      includeOpenTabs: false,
    });
  }

  private getHtml(_webview: vscode.Webview): string {
    // HTML is bundled directly via chatHtml.ts — no disk read needed at runtime.
    return getChatHtml();
  }
}
