// src/services/WorkspaceContextService.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { WorkspaceContext } from '../models';
import { logger } from '../utils/logger';
import { looksLikeSensitive, redactSecrets, truncate, normalizePath } from '../utils/helpers';

const MANIFEST_FILES = ['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle', 'composer.json', 'requirements.txt', 'Gemfile'];
const README_NAMES = ['README.md', 'readme.md', 'README.txt', 'readme.txt', 'README.rst'];

export class WorkspaceContextService {
  private gitignorePatterns: string[] = [];

  /** Build a workspace context snapshot for the current editor state. */
  async gatherContext(opts: {
    includeCurrentFile?: boolean;
    includeSelection?: boolean;
    includeOpenTabs?: boolean;
  } = {}): Promise<WorkspaceContext> {
    const cfg = vscode.workspace.getConfiguration('localCodeAgent');
    const maxFileBytes: number = cfg.get('maxFileBytes') ?? 65536;
    const excludeGlobs: string[] = cfg.get('excludeGlobs') ?? [];
    const includeGitStatus: boolean = cfg.get('includeGitStatus') ?? true;

    const rootPath = this.getWorkspaceRoot();

    const ctx: WorkspaceContext = {
      rootPath,
      fileTree: '',
      openFiles: [],
      manifests: {},
    };

    // File tree
    ctx.fileTree = await this.buildFileTree(rootPath, excludeGlobs);

    // Open editors
    ctx.openFiles = vscode.window.tabGroups.all
      .flatMap(g => g.tabs)
      .map(t => (t.input instanceof vscode.TabInputText ? normalizePath(t.input.uri.fsPath) : null))
      .filter((f): f is string => f !== null);

    // Active file
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      ctx.activeFile = normalizePath(activeEditor.document.uri.fsPath);

      if (opts.includeCurrentFile) {
        // Content injected by PromptBuilderService
      }

      if (opts.includeSelection && !activeEditor.selection.isEmpty) {
        const sel = activeEditor.selection;
        ctx.selectedText = activeEditor.document.getText(sel);
        ctx.selectedRange = { startLine: sel.start.line, endLine: sel.end.line };
      }
    }

    // Git status
    if (includeGitStatus) {
      ctx.gitStatus = await this.getGitStatus(rootPath);
    }

    // Manifests
    for (const mf of MANIFEST_FILES) {
      const full = path.join(rootPath, mf);
      if (fs.existsSync(full)) {
        try {
          const raw = fs.readFileSync(full, 'utf8');
          ctx.manifests[mf] = truncate(raw, maxFileBytes / 2);
        } catch { /* skip */ }
      }
    }

    // README
    for (const rn of README_NAMES) {
      const full = path.join(rootPath, rn);
      if (fs.existsSync(full)) {
        try {
          ctx.readme = truncate(fs.readFileSync(full, 'utf8'), 4096);
          break;
        } catch { /* skip */ }
      }
    }

    return ctx;
  }

  getWorkspaceRoot(): string {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const wf = vscode.workspace.getWorkspaceFolder(editor.document.uri);
      if (wf) return wf.uri.fsPath;
    }
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) return folders[0].uri.fsPath;
    return process.cwd();
  }

  async readFileContent(filePath: string): Promise<string | null> {
    const cfg = vscode.workspace.getConfiguration('localCodeAgent');
    const maxFileBytes: number = cfg.get('maxFileBytes') ?? 65536;

    try {
      if (looksLikeSensitive(filePath)) {
        logger.warn('Skipping sensitive file:', filePath);
        return `[File omitted — appears to contain sensitive data: ${path.basename(filePath)}]`;
      }
      const stats = fs.statSync(filePath);
      if (stats.size > maxFileBytes * 2) {
        return `[File too large to include: ${path.basename(filePath)} (${Math.round(stats.size / 1024)} KB)]`;
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      return truncate(redactSecrets(raw), maxFileBytes);
    } catch (err) {
      logger.warn('Could not read file:', filePath, err);
      return null;
    }
  }

  private async buildFileTree(root: string, excludeGlobs: string[]): Promise<string> {
    const cfg = vscode.workspace.getConfiguration('localCodeAgent');
    const maxFiles: number = cfg.get('maxFilesInContext') ?? 10;

    const lines: string[] = [];
    let count = 0;

    const walk = (dir: string, prefix: string, depth: number) => {
      if (depth > 5 || count > 300) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch { return; }

      // Sort: dirs first, then files
      entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

      for (const entry of entries) {
        if (count > 300) break;
        const rel = normalizePath(path.relative(root, path.join(dir, entry.name)));
        if (this.shouldExclude(rel, entry.name, excludeGlobs)) continue;

        if (entry.isDirectory()) {
          lines.push(`${prefix}${entry.name}/`);
          walk(path.join(dir, entry.name), prefix + '  ', depth + 1);
        } else {
          lines.push(`${prefix}${entry.name}`);
          count++;
        }
      }
    };

    walk(root, '', 0);

    if (count > maxFiles * 10) {
      lines.push(`... (${count} files total, showing structure only)`);
    }

    return lines.join('\n');
  }

  private shouldExclude(rel: string, name: string, globs: string[]): boolean {
    // Always exclude hidden dirs (except .github, etc.)
    if (name.startsWith('.') && !['github', 'vscode'].includes(name.slice(1))) return true;

    for (const glob of globs) {
      if (this.matchGlob(rel, glob)) return true;
    }
    return false;
  }

  private matchGlob(p: string, pattern: string): boolean {
    // Convert glob to regex — simple implementation supporting ** and *
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '__DOUBLE__')
      .replace(/\*/g, '[^/]*')
      .replace(/__DOUBLE__/g, '.*');
    const re = new RegExp(`^${escaped}$`);
    return re.test(p) || re.test(`${p}/`);
  }

  private async getGitStatus(root: string): Promise<string | undefined> {
    try {
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFile);
      const { stdout } = await execFileAsync('git', ['status', '--short'], { cwd: root, timeout: 5000 });
      return stdout.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  async getGitDiff(root: string): Promise<string | undefined> {
    try {
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFile);
      const { stdout } = await execFileAsync('git', ['diff', 'HEAD'], { cwd: root, timeout: 5000 });
      return truncate(stdout.trim(), 16384) || undefined;
    } catch {
      return undefined;
    }
  }
}
