# Local Code Agent

A production-quality VS Code extension that gives you a **local AI coding assistant** powered by [Ollama](https://ollama.ai) — workspace-aware, streaming, privacy-first, and completely offline.

Inspired by Claude Code's workflow patterns but built entirely on open, local tooling. No Anthropic API key, no cloud, no telemetry.

---

## Features

- **Sidebar chat panel** with streaming responses and session history
- **Workspace awareness**: file tree, open tabs, git status, manifests, README
- **Include context chips**: toggle current file, selection, or open tabs per message
- **Propose & preview edits**: structured JSON edits with VS Code diff view — never silently rewrites files
- **Terminal approval flow**: commands require explicit user confirmation before running
- **Persistent sessions**: per-workspace chat history stored in extension storage
- **Multiple sessions**: create, rename, delete, export chat sessions
- **Right-click editor commands**: Ask, Fix, Refactor, Explain, Generate Tests
- **Model selector**: switch Ollama models from the sidebar
- **Backend diagnostics**: check Ollama connectivity, list available models

---

## Requirements

- VS Code 1.85 or newer
- [Ollama](https://ollama.ai) running locally
- Your desired model pulled: `ollama pull gemma4:e2b`

---

## Quick Start

### 1. Install dependencies and build

```bash
cd local-code-agent
npm install
node esbuild.config.js --production
```

### 2. Add an icon (required for packaging, optional for dev)

Either create a 128×128 PNG at `media/icon.png`, or run:

```bash
# macOS/Linux with ImageMagick
convert -size 128x128 xc:'#1e1e2e' \
  -fill '#89b4fa' -draw 'circle 64,64 64,20' \
  -fill '#a6e3a1' -draw 'circle 64,64 64,50' \
  media/icon.png

# Or just copy any 128x128 PNG there
cp ~/my-icon.png media/icon.png
```

### 3. Run in Extension Development Host

Open the `local-code-agent` folder in VS Code, then press **F5** (or Run → Start Debugging → "Run Extension").

A new VS Code window opens with the extension active. You'll see the ⚡ icon in the Activity Bar.

### 4. Make sure Ollama is running

```bash
ollama serve
# In another terminal:
ollama pull gemma4:e2b
```

### 5. Test with your model

Click the ⚡ icon in the Activity Bar → the chat panel opens. The model selector shows `gemma4:e2b` by default. Type a question and press **Ctrl+Enter** (or click Send).

---

## Extension Development Workflow

```bash
# Watch mode (rebuilds on save, use with F5 in VS Code)
node esbuild.config.js --watch

# One-shot production build
node esbuild.config.js --production

# Type-check without emitting
npx tsc --noEmit

# Lint
npx eslint src --ext ts
```

**Recommended dev loop:**

1. Open `local-code-agent/` in VS Code
2. Run `npm run dev` in a terminal (or use the "npm: dev" task)  
3. Press **F5** → Extension Development Host opens
4. Edit source → esbuild rebuilds → press **Ctrl+R** in the dev host to reload

---

## Configuration

All settings live under `localCodeAgent.*` in VS Code Settings (UI or `settings.json`).

| Setting | Default | Description |
|---|---|---|
| `backend` | `"ollama-api"` | `"ollama-api"` (HTTP) or `"ollama-launch"` (terminal, Phase 2) |
| `ollama.baseUrl` | `"http://localhost:11434"` | Ollama HTTP API base URL |
| `ollama.model` | `"gemma4:e2b"` | Model name to use |
| `ollama.temperature` | `0.2` | Sampling temperature (0–2) |
| `ollama.topP` | `0.9` | Top-p sampling |
| `ollama.numPredict` | `4096` | Max tokens per response |
| `ollama.keepAlive` | `"5m"` | How long to keep model loaded (`"-1"` = forever) |
| `maxFilesInContext` | `10` | Max files included in workspace scan |
| `maxFileBytes` | `65536` | Max bytes per file before truncation |
| `excludeGlobs` | `["**/node_modules/**", ...]` | Globs to exclude from scanning |
| `includeGitStatus` | `true` | Include `git status` in context |
| `enableTerminalExecution` | `true` | Allow proposing terminal commands |
| `requireTerminalApproval` | `true` | Require approval before running any command |
| `autoOpenDiffPreview` | `true` | Auto-open diff when single-file edit is proposed |
| `logLevel` | `"info"` | Log level: `off` / `error` / `warn` / `info` / `debug` |

### Switching models

Either:
- Change `localCodeAgent.ollama.model` in settings, **or**
- Use the model selector dropdown in the sidebar (updates settings automatically)

```bash
# Pull additional models
ollama pull llama3.2:3b
ollama pull qwen2.5-coder:7b
ollama pull deepseek-coder-v2:16b
```

---

## Commands

All commands are available in the Command Palette (`Ctrl+Shift+P`):

| Command | Description |
|---|---|
| `Local Code Agent: Open Panel` | Focus the sidebar chat |
| `Local Code Agent: New Chat` | Start a fresh session |
| `Local Code Agent: Ask About Current File` | Analyze the active file |
| `Local Code Agent: Ask About Selection` | Explain selected code |
| `Local Code Agent: Explain Current Function` | Explain selected/current code |
| `Local Code Agent: Propose Fix for Current Error` | Fix diagnostics errors |
| `Local Code Agent: Refactor Current File` | Suggest refactoring |
| `Local Code Agent: Review Git Diff` | Review `git diff HEAD` |
| `Local Code Agent: Generate Tests for Current File` | Generate unit tests |
| `Local Code Agent: Explain Project Structure` | Summarize the workspace |
| `Local Code Agent: Scan Workspace` | Refresh workspace context |
| `Local Code Agent: Check Backend` | Verify Ollama is reachable |
| `Local Code Agent: Run Approved Command` | Propose a command to run |

Right-click in the editor for context menu shortcuts.

---

## Edit Proposal Format

The assistant proposes edits as structured JSON inside triple-backtick blocks:

````
```json
{
  "edits": [
    {
      "filePath": "src/app.ts",
      "operation": "replace",
      "startLine": 10,
      "endLine": 15,
      "newContent": "// new code here",
      "description": "Replace legacy handler with async version"
    }
  ],
  "summary": "Replace legacy handler with async/await"
}
```
````

When edits are proposed:
1. A **Proposed Edit** card appears in the chat
2. If `autoOpenDiffPreview` is enabled and there's a single edit, a diff view opens automatically
3. Click **Accept All** to apply (uses VS Code WorkspaceEdit for undo support on open files)
4. Click **Preview** to open the diff view
5. Click **Reject** to dismiss

---

## Terminal Approval Flow

The assistant may propose commands like:

````
```terminal
{"command": "npm test", "cwd": ".", "riskNote": "Runs tests — no side effects"}
```
````

A **Terminal Command** card appears in the chat with three options:
- **Run Once** — executes immediately in a background process, output fed back into chat
- **Always Allow** — adds the command to the session allow-list (no future prompts)
- **Cancel** — dismisses without running

Output is automatically appended as a tool message so the model can reason about results.

---

## Packaging as .vsix

```bash
# Install vsce if you don't have it
npm install -g @vscode/vsce

# Create a 128x128 media/icon.png first (required)

# Package
npx vsce package

# Output: local-code-agent-0.1.0.vsix
```

### Install the .vsix

```bash
# Via CLI
code --install-extension local-code-agent-0.1.0.vsix

# Or in VS Code: Extensions → ··· → Install from VSIX
```

---

## Architecture

```
src/
├── extension.ts                  # Activation entry point
├── commands/
│   └── index.ts                  # All command registrations
├── views/
│   └── ChatViewProvider.ts       # Sidebar webview provider + message routing
├── webview/
│   └── chat.html                 # Self-contained webview UI (HTML/CSS/JS)
├── providers/
│   └── llm/
│       └── OllamaApiProvider.ts  # Ollama HTTP streaming client
├── services/
│   ├── WorkspaceContextService.ts # File tree, git, manifests, active file
│   ├── PromptBuilderService.ts    # System prompt + context assembly
│   ├── ChatSessionService.ts      # Persistent session storage
│   ├── PatchService.ts            # Edit parsing, validation, application
│   ├── TerminalApprovalService.ts # Command parsing + execution
│   └── DiagnosticsService.ts      # Backend health checks
├── models/
│   └── index.ts                   # All shared TypeScript types
└── utils/
    ├── logger.ts                   # Levelled output channel logger
    └── helpers.ts                  # generateId, truncate, redactSecrets, etc.
```

**Data flow for a chat message:**

```
User types → Webview → ChatViewProvider
  → WorkspaceContextService (gather file tree, git, active file)
  → PromptBuilderService (build system prompt + context header + history)
  → OllamaApiProvider.streamChat (HTTP POST /api/chat, NDJSON stream)
  → tokens streamed back to Webview in real-time
  → PatchService.parseEditsFromResponse (look for ```json edit blocks)
  → TerminalApprovalService.parseCommandFromResponse (look for ```terminal blocks)
  → ChatSessionService.addMessage (persist to workspaceState)
```

---

## Security & Privacy

- **Local only**: all data stays on your machine. The only network call is to `http://localhost:11434`.
- **Secret redaction**: file content is passed through `redactSecrets()` before sending — strips API keys, tokens, and long base64 strings.
- **Sensitive file detection**: `.env`, `.pem`, `.key`, `secrets`, etc. are flagged and skipped automatically.
- **Workspace boundary**: patch validation refuses any edit targeting paths outside the workspace root.
- **Terminal approval**: no command runs without explicit user consent (unless added to session allow-list).
- **No telemetry**: the extension sends no analytics or usage data anywhere.

---

## Switching to Terminal Mode (Phase 2 / Optional)

Set `localCodeAgent.backend` to `"ollama-launch"` in settings. In this mode the extension will spawn:

```bash
ollama launch claude --model gemma4:e2b
```

> **Note**: Terminal mode is less stable than the HTTP API and is provided as a fallback only. The HTTP API (`ollama-api`) is strongly recommended.

---

## Known Limitations

1. **No streaming abort mid-sentence**: stopping generation terminates cleanly but the partial token buffer may still render.
2. **No vector search**: workspace awareness is file-tree + grep-style, not semantic embedding search. Large monorepos should increase `excludeGlobs`.
3. **Markdown renderer is basic**: the built-in renderer in the webview handles common cases but doesn't support tables or task lists.
4. **Multi-file diff**: the diff preview currently shows one file at a time. Multi-edit proposals show a summary card; each file can be previewed individually.
5. **No streaming into the diff editor**: diffs are generated post-response, not live.
6. **Context window limits**: very large files are truncated at `maxFileBytes`. For huge codebases, be selective with context chips.
7. **Windows paths**: normalized to forward slashes internally; should work cross-platform but test with your setup.

---

## Roadmap (Phase 2 & 3)

**Phase 2**
- [ ] `@file` and `@symbol` mention syntax in the prompt input
- [ ] Git-aware prompts (blame, log, branch diff)
- [ ] Full diagnostics webview panel
- [ ] Export/import sessions as JSON
- [ ] Terminal-mode backend (`ollama launch`)

**Phase 3**
- [ ] Hunk-by-hunk diff acceptance
- [ ] Code action integration (lightbulb menu)
- [ ] Slash command system (`/explain`, `/test`, `/fix`)
- [ ] Workspace embeddings index for semantic search
- [ ] Test generation workflow with runner integration

---

## Testing Strategy

### Manual testing checklist

```
[ ] Extension activates without errors (check Output → Local Code Agent)
[ ] Sidebar panel opens and shows the chat UI
[ ] "Check Backend" shows Ollama is reachable
[ ] Model selector populates with available models
[ ] Sending a message streams tokens in real-time
[ ] "Stop" button halts generation
[ ] Sessions persist across reloads (close/reopen VS Code)
[ ] "New Chat" creates a new session
[ ] "Ask About Current File" includes file content in context
[ ] "Ask About Selection" includes selected text
[ ] Edit proposals show a card with Accept/Preview/Reject
[ ] Accepting edits applies them (check file content + Undo works)
[ ] Terminal commands show an approval card
[ ] Approving a command runs it and shows output in chat
[ ] Rejecting a command does nothing
[ ] Sensitive files (.env) are skipped or warned about
[ ] "Refactor Current File" triggers an edit proposal
[ ] "Generate Tests" produces a new test file edit
[ ] "Review Git Diff" works in a repo with changes
```

### Automated tests (to add)

For a full test suite, add `@vscode/test-electron` and write tests for:
- `WorkspaceContextService.gatherContext()` — mock filesystem
- `PatchService.parseEditsFromResponse()` — unit test JSON parsing
- `PatchService.applyEditToContent()` — pure function, easy to test
- `TerminalApprovalService.parseCommandFromResponse()` — unit test regex
- `ChatSessionService` — test create/add/delete/persist lifecycle
- `OllamaApiProvider` — integration test against real Ollama (skip in CI)

```bash
npm install --save-dev @vscode/test-electron mocha @types/mocha
```

---

## Troubleshooting

**Ollama not reachable**
```bash
# Make sure Ollama is running
ollama serve
# Verify the API
curl http://localhost:11434/api/tags
```

**Model not found**
```bash
ollama pull gemma4:e2b
# Or check what you have:
ollama list
```

**Extension not activating**
- Open VS Code Output panel → select "Local Code Agent" from the dropdown
- Check for errors in the debug console (Help → Toggle Developer Tools)

**Edits not applying**
- The file must be within the workspace root
- Sensitive files are blocked — check the Output channel for warnings
- For open files, edits go through WorkspaceEdit (supports Undo)

**Build fails**
```bash
node --version   # Must be >= 18
npm install      # Re-install deps
node esbuild.config.js --production
```

---

## License

MIT — build, fork, extend freely.
