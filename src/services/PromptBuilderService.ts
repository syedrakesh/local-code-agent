// src/services/PromptBuilderService.ts
import * as path from 'path';
import * as vscode from 'vscode';
import { LLMMessage, WorkspaceContext } from '../models';
import { WorkspaceContextService } from './WorkspaceContextService';
import { truncate } from '../utils/helpers';

// ──────────────────────────────────────────────────────────────────────────────
// System prompt
// ──────────────────────────────────────────────────────────────────────────────

const BASE_SYSTEM_PROMPT = `You are Local Code Agent, a practical, concise AI coding assistant running entirely on this machine via Ollama. You help developers understand, navigate, edit, and improve their codebase.

## Rules
- Be concise and code-focused. Avoid unnecessary prose.
- Always reason from the actual workspace context provided. Never invent file paths or symbol names.
- Prefer minimal, targeted changes. Explain your intent before making edits.
- When proposing file edits, output them in the structured JSON format described below.
- For multi-file changes, show a plan first and ask for confirmation.
- Ask before performing destructive operations.
- When uncertain about a file's content, say so rather than guessing.

## Edit Format
When you want to modify files, output a JSON block wrapped in triple backticks:

\`\`\`json
{
  "edits": [
    {
      "filePath": "relative/path/to/file.ts",
      "operation": "replace",
      "startLine": 10,
      "endLine": 15,
      "newContent": "// new code here",
      "description": "Short description of this change"
    }
  ],
  "summary": "One-sentence summary of all changes"
}
\`\`\`

Operations: "replace" | "insert" | "delete" | "create" | "rename"
- For "create": provide filePath and newContent (no range needed).
- For "rename": provide filePath and newPath.
- For "insert": startLine is where to insert (content goes before that line).
- For "delete": provide startLine and endLine.

## Terminal Commands
When you want to run a shell command, output it like this:

\`\`\`terminal
{"command": "npm test", "cwd": ".", "riskNote": "Runs tests, no side effects"}
\`\`\`

The user will be asked to approve before execution.

## Response Style
- Use markdown for explanations.
- Keep code blocks accurate and complete.
- Reference files as \`path/to/file.ts:line\` when helpful.
`;

// ──────────────────────────────────────────────────────────────────────────────
// Reusable prompt templates
// ──────────────────────────────────────────────────────────────────────────────

export const PromptTemplates = {
  explainCode: (code: string, filePath: string) =>
    `Explain the following code from \`${filePath}\` clearly and concisely:\n\n\`\`\`\n${code}\n\`\`\``,

  debugError: (error: string, code: string, filePath: string) =>
    `There is an error in \`${filePath}\`:\n\nError:\n${error}\n\nCode:\n\`\`\`\n${code}\n\`\`\`\n\nDiagnose the root cause and propose a fix using the edit format.`,

  proposeRefactor: (code: string, filePath: string) =>
    `Review the following code from \`${filePath}\` and propose targeted refactoring improvements. Show the plan before making edits.\n\n\`\`\`\n${code}\n\`\`\``,

  generateTests: (code: string, filePath: string) =>
    `Generate comprehensive unit tests for the code in \`${filePath}\`. Match the existing test framework if visible in the project. Output as a new test file using the edit format.\n\n\`\`\`\n${code}\n\`\`\``,

  explainStructure: (tree: string) =>
    `Explain the structure and purpose of this project based on the file tree and available manifests:\n\n${tree}`,

  reviewGitDiff: (diff: string) =>
    `Review the following git diff. Identify potential bugs, style issues, or improvements:\n\n\`\`\`diff\n${diff}\n\`\`\``,
};

// ──────────────────────────────────────────────────────────────────────────────
// Builder
// ──────────────────────────────────────────────────────────────────────────────

export class PromptBuilderService {
  constructor(private readonly contextSvc: WorkspaceContextService) {}

  buildSystemPrompt(): string {
    return BASE_SYSTEM_PROMPT;
  }

  async buildContextHeader(ctx: WorkspaceContext, opts: {
    includeCurrentFile?: boolean;
    includeSelection?: boolean;
    includeOpenTabs?: boolean;
  } = {}): Promise<string> {
    const parts: string[] = [];

    parts.push(`## Workspace Root\n\`${ctx.rootPath}\``);

    if (ctx.fileTree) {
      parts.push(`## Project File Tree\n\`\`\`\n${truncate(ctx.fileTree, 4096)}\n\`\`\``);
    }

    if (ctx.gitStatus) {
      parts.push(`## Git Status\n\`\`\`\n${ctx.gitStatus}\n\`\`\``);
    }

    if (Object.keys(ctx.manifests).length > 0) {
      const manifest = Object.entries(ctx.manifests)
        .map(([k, v]) => `### ${k}\n\`\`\`\n${truncate(v, 2048)}\n\`\`\``)
        .join('\n\n');
      parts.push(`## Project Manifests\n${manifest}`);
    }

    if (ctx.readme) {
      parts.push(`## README\n${truncate(ctx.readme, 2048)}`);
    }

    if (opts.includeOpenTabs && ctx.openFiles.length > 0) {
      parts.push(`## Open Files\n${ctx.openFiles.map(f => `- \`${f}\``).join('\n')}`);
    }

    if (ctx.activeFile) {
      parts.push(`## Active File\n\`${ctx.activeFile}\``);

      if (opts.includeCurrentFile) {
        const content = await this.contextSvc.readFileContent(ctx.activeFile);
        if (content) {
          const lang = this.detectLang(ctx.activeFile);
          parts.push(`## Current File Content (\`${path.basename(ctx.activeFile)}\`)\n\`\`\`${lang}\n${content}\n\`\`\``);
        }
      }
    }

    if (opts.includeSelection && ctx.selectedText && ctx.activeFile) {
      const lang = this.detectLang(ctx.activeFile);
      const range = ctx.selectedRange
        ? ` (lines ${ctx.selectedRange.startLine + 1}–${ctx.selectedRange.endLine + 1})`
        : '';
      parts.push(`## Selected Text${range}\n\`\`\`${lang}\n${ctx.selectedText}\n\`\`\``);
    }

    return parts.join('\n\n');
  }

  async buildMessages(
    historyMessages: { role: 'user' | 'assistant'; content: string }[],
    newUserContent: string,
    ctx: WorkspaceContext,
    opts: { includeCurrentFile?: boolean; includeSelection?: boolean; includeOpenTabs?: boolean } = {}
  ): Promise<LLMMessage[]> {
    const contextHeader = await this.buildContextHeader(ctx, opts);
    const systemContent = `${this.buildSystemPrompt()}\n\n---\n\n${contextHeader}`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemContent },
      ...historyMessages,
      { role: 'user', content: newUserContent },
    ];

    return messages;
  }

  private detectLang(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const map: Record<string, string> = {
      '.ts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.jsx': 'jsx',
      '.py': 'python', '.go': 'go', '.rs': 'rust', '.java': 'java',
      '.cs': 'csharp', '.cpp': 'cpp', '.c': 'c', '.rb': 'ruby',
      '.php': 'php', '.swift': 'swift', '.kt': 'kotlin', '.sh': 'bash',
      '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.md': 'markdown',
      '.html': 'html', '.css': 'css', '.scss': 'scss', '.sql': 'sql',
    };
    return map[ext] ?? '';
  }

  /** Build context snippet for quick commands like "ask about selection". */
  async buildQuickPrompt(template: string, opts: {
    includeCurrentFile?: boolean;
    includeSelection?: boolean;
  } = {}): Promise<string> {
    const ctx = await this.contextSvc.gatherContext(opts);
    const header = await this.buildContextHeader(ctx, opts);
    return `${header}\n\n---\n\n${template}`;
  }

  /** Get editor diagnostics (errors/warnings) for the active file. */
  getActiveDiagnostics(): string {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return '';
    const diags = vscode.languages.getDiagnostics(editor.document.uri);
    if (diags.length === 0) return '';
    return diags
      .filter(d => d.severity <= vscode.DiagnosticSeverity.Warning)
      .slice(0, 20)
      .map(d => `Line ${d.range.start.line + 1}: [${d.severity === 0 ? 'error' : 'warning'}] ${d.message}`)
      .join('\n');
  }
}
