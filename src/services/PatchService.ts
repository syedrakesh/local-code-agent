// src/services/PatchService.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { FileEdit, PatchProposal } from '../models';
import { logger } from '../utils/logger';
import { generateId, looksLikeSensitive } from '../utils/helpers';
import { WorkspaceContextService } from './WorkspaceContextService';

export class PatchService {
  private pendingProposals: Map<string, PatchProposal> = new Map();

  constructor(private readonly contextSvc: WorkspaceContextService) {}

  /** Parse structured JSON edit blocks from an assistant response. */
  parseEditsFromResponse(response: string, sessionId: string): PatchProposal | null {
    // Look for ```json ... ``` blocks that contain an "edits" array
    const jsonBlockRe = /```json\s*([\s\S]*?)\s*```/gi;
    let match: RegExpExecArray | null;

    while ((match = jsonBlockRe.exec(response)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed && Array.isArray(parsed.edits) && parsed.edits.length > 0) {
          const proposal: PatchProposal = {
            id: generateId(),
            summary: parsed.summary ?? 'Proposed changes',
            edits: parsed.edits as FileEdit[],
            sessionId,
            timestamp: Date.now(),
            status: 'pending',
          };
          this.pendingProposals.set(proposal.id, proposal);
          return proposal;
        }
      } catch { /* not valid JSON */ }
    }
    return null;
  }

  getProposal(id: string): PatchProposal | undefined {
    return this.pendingProposals.get(id);
  }

  /** Resolve a possibly-relative file path against the workspace root. */
  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) return filePath;
    return path.join(this.contextSvc.getWorkspaceRoot(), filePath);
  }

  /** Show VS Code diff editor for a single edit. */
  async previewEdit(edit: FileEdit): Promise<void> {
    const absPath = this.resolvePath(edit.filePath);

    let originalContent = '';
    try {
      if (fs.existsSync(absPath)) {
        originalContent = fs.readFileSync(absPath, 'utf8');
      }
    } catch { /* new file */ }

    const proposedContent = this.applyEditToContent(originalContent, edit);

    const originalUri = vscode.Uri.parse(`local-code-agent-original:/${edit.filePath}`);
    const proposedUri = vscode.Uri.parse(`local-code-agent-proposed:/${edit.filePath}`);

    // Register ephemeral content providers
    const originalProvider = vscode.workspace.registerTextDocumentContentProvider('local-code-agent-original', {
      provideTextDocumentContent: () => originalContent,
    });
    const proposedProvider = vscode.workspace.registerTextDocumentContentProvider('local-code-agent-proposed', {
      provideTextDocumentContent: () => proposedContent,
    });

    await vscode.commands.executeCommand('vscode.diff', originalUri, proposedUri, `Proposed: ${edit.filePath}`, {
      preview: true,
    });

    // Dispose providers after a short window
    setTimeout(() => {
      originalProvider.dispose();
      proposedProvider.dispose();
    }, 60_000);
  }

  /** Apply a single edit to a string of content and return the result. */
  applyEditToContent(original: string, edit: FileEdit): string {
    if (edit.operation === 'create') {
      return edit.newContent ?? '';
    }

    const lines = original.split('\n');

    if (edit.operation === 'delete') {
      const start = edit.startLine ?? 0;
      const end = edit.endLine ?? start;
      lines.splice(start, end - start + 1);
      return lines.join('\n');
    }

    if (edit.operation === 'replace') {
      const start = edit.startLine ?? 0;
      const end = edit.endLine ?? start;
      const newLines = (edit.newContent ?? '').split('\n');
      lines.splice(start, end - start + 1, ...newLines);
      return lines.join('\n');
    }

    if (edit.operation === 'insert') {
      const at = edit.startLine ?? lines.length;
      const newLines = (edit.newContent ?? '').split('\n');
      lines.splice(at, 0, ...newLines);
      return lines.join('\n');
    }

    return original;
  }

  /** Validate edits before applying. Returns error string or null if valid. */
  validateEdit(edit: FileEdit): string | null {
    const root = this.contextSvc.getWorkspaceRoot();
    const abs = this.resolvePath(edit.filePath);

    // Check workspace boundary
    if (!abs.startsWith(root)) {
      return `Edit targets a path outside the workspace: ${edit.filePath}`;
    }

    // Sensitive file warning
    if (looksLikeSensitive(edit.filePath)) {
      return `Edit targets a potentially sensitive file: ${edit.filePath}`;
    }

    if (edit.operation !== 'create' && edit.operation !== 'rename') {
      if (!fs.existsSync(abs)) {
        return `File does not exist: ${edit.filePath}`;
      }
    }

    if (edit.operation === 'rename' && !edit.newPath) {
      return 'Rename operation requires newPath.';
    }

    return null;
  }

  /** Apply all edits in a proposal after user approval. */
  async applyProposal(proposalId: string): Promise<{ applied: number; errors: string[] }> {
    const proposal = this.pendingProposals.get(proposalId);
    if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);

    const errors: string[] = [];
    let applied = 0;

    for (const edit of proposal.edits) {
      const validErr = this.validateEdit(edit);
      if (validErr) {
        errors.push(validErr);
        continue;
      }

      try {
        await this.applySingleEdit(edit);
        applied++;
      } catch (err) {
        errors.push(`Failed to apply edit to ${edit.filePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    proposal.status = errors.length === 0 ? 'accepted' : 'pending';
    return { applied, errors };
  }

  private async applySingleEdit(edit: FileEdit): Promise<void> {
    const absPath = this.resolvePath(edit.filePath);

    if (edit.operation === 'create') {
      const dir = path.dirname(absPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const uri = vscode.Uri.file(absPath);
      const encoder = new TextEncoder();
      await vscode.workspace.fs.writeFile(uri, encoder.encode(edit.newContent ?? ''));
      logger.info('Created file:', absPath);
      return;
    }

    if (edit.operation === 'rename' && edit.newPath) {
      const newAbs = this.resolvePath(edit.newPath);
      fs.renameSync(absPath, newAbs);
      logger.info('Renamed:', absPath, '->', newAbs);
      return;
    }

    // Read via VS Code workspace API to respect open editors
    const uri = vscode.Uri.file(absPath);
    let originalContent = '';
    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      originalContent = new TextDecoder().decode(raw);
    } catch { /* file may not exist for insert-at-end */ }

    const newContent = this.applyEditToContent(originalContent, edit);
    const encoder = new TextEncoder();

    // If the file is open in an editor, apply as a WorkspaceEdit for undo support
    const openDoc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === absPath);
    if (openDoc) {
      const we = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(
        new vscode.Position(0, 0),
        new vscode.Position(openDoc.lineCount, 0)
      );
      we.replace(uri, fullRange, newContent);
      await vscode.workspace.applyEdit(we);
      logger.info('Applied edit via WorkspaceEdit:', absPath);
    } else {
      await vscode.workspace.fs.writeFile(uri, encoder.encode(newContent));
      logger.info('Applied edit via fs.writeFile:', absPath);
    }
  }

  rejectProposal(proposalId: string): void {
    const p = this.pendingProposals.get(proposalId);
    if (p) p.status = 'rejected';
  }
}
