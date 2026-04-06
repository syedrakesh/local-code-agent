// src/services/DiagnosticsService.ts
import * as vscode from 'vscode';
import { OllamaApiProvider } from '../providers/llm/OllamaApiProvider';
import { HealthStatus } from '../models';
import { logger } from '../utils/logger';

export class DiagnosticsService {
  constructor(private readonly provider: OllamaApiProvider) {}

  async checkBackend(): Promise<HealthStatus> {
    const cfg = vscode.workspace.getConfiguration('localCodeAgent');
    const baseUrl: string = cfg.get('ollama.baseUrl') ?? 'http://localhost:11434';
    const model: string = cfg.get('ollama.model') ?? 'gemma4:e2b';

    logger.info(`Checking Ollama at ${baseUrl} with model ${model}…`);

    this.provider.setBaseUrl(baseUrl);
    this.provider.setModel(model);

    const status = await this.provider.healthCheck();
    logger.info('Health check result:', JSON.stringify(status));
    return status;
  }

  async showDiagnosticsPanel(status: HealthStatus): Promise<void> {
    const icon = status.reachable ? '✅' : '❌';
    const lines: string[] = [
      `${icon} Ollama Status: ${status.reachable ? 'Reachable' : 'Unreachable'}`,
      `🤖 Configured model: ${status.model}`,
    ];

    if (status.reachable) {
      if (status.availableModels.length > 0) {
        lines.push(`📦 Available models:\n   ${status.availableModels.join('\n   ')}`);
        if (!status.availableModels.includes(status.model)) {
          lines.push(`⚠️  Configured model "${status.model}" not found in available models.`);
          lines.push(`   Run: ollama pull ${status.model}`);
        }
      } else {
        lines.push('⚠️  Could not retrieve model list — Ollama may have no models installed.');
        lines.push(`   Run: ollama pull ${status.model}`);
      }
    } else {
      lines.push('');
      lines.push('🔧 Troubleshooting:');
      lines.push('   1. Make sure Ollama is running: ollama serve');
      lines.push('   2. Check the base URL in settings (localCodeAgent.ollama.baseUrl)');
      if (status.error) lines.push(`   3. Error: ${status.error}`);
    }

    const msg = lines.join('\n');
    if (status.reachable) {
      vscode.window.showInformationMessage('Local Code Agent: Backend OK', { detail: msg, modal: true });
    } else {
      vscode.window.showErrorMessage('Local Code Agent: Backend Unreachable', { detail: msg, modal: true });
    }
  }
}
