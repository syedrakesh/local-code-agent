// src/utils/helpers.ts
import * as crypto from 'crypto';
import * as path from 'path';

export function generateId(): string {
  return crypto.randomBytes(8).toString('hex');
}

export function truncate(text: string, maxBytes: number): string {
  const buf = Buffer.from(text, 'utf8');
  if (buf.length <= maxBytes) return text;
  return buf.subarray(0, maxBytes).toString('utf8') + '\n... [truncated]';
}

/** Returns true if the path looks like it contains a secret/credential. */
export function looksLikeSensitive(filePath: string): boolean {
  const base = path.basename(filePath).toLowerCase();
  const sensitiveNames = ['.env', '.pem', '.key', '.p12', '.pfx', 'secrets', 'credentials', 'token', 'password', 'private'];
  return sensitiveNames.some(n => base.includes(n));
}

/** Redact obvious secret patterns from text. */
export function redactSecrets(text: string): string {
  // API keys, tokens, passwords in assignments
  return text
    .replace(/((?:api[_-]?key|token|secret|password|passwd|auth)\s*[:=]\s*["']?)([A-Za-z0-9+/=_\-.]{8,})("?)/gi, '$1[REDACTED]$3')
    .replace(/([A-Za-z0-9+/]{40,})/g, match => {
      // Heuristic: long base64-like strings are likely secrets
      if (/^[A-Za-z0-9+/=]+$/.test(match) && match.length > 40) return '[REDACTED]';
      return match;
    });
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Format bytes to a human-readable string. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/** Normalise a file path to forward slashes. */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}
