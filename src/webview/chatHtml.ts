// src/webview/chatHtml.ts
// The entire webview UI is inlined here so esbuild bundles it into dist/extension.js.
// This avoids any fs.readFileSync at runtime which fails in the Extension Development Host
// because 'src/' is not distributed — only 'dist/' is.

export function getChatHtml(): string {
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Local Code Agent</title>
  <style>
    :root {
      --bg: var(--vscode-sideBar-background, #1e1e2e);
      --bg2: var(--vscode-editor-background, #181825);
      --bg3: var(--vscode-input-background, #2a2a3d);
      --fg: var(--vscode-sideBar-foreground, #cdd6f4);
      --fg2: var(--vscode-descriptionForeground, #a6adc8);
      --accent: var(--vscode-button-background, #89b4fa);
      --accent-fg: var(--vscode-button-foreground, #1e1e2e);
      --border: var(--vscode-panel-border, #313244);
      --error: var(--vscode-errorForeground, #f38ba8);
      --warn: var(--vscode-editorWarning-foreground, #fab387);
      --success: var(--vscode-testing-iconPassed, #a6e3a1);
      --user-bubble: var(--vscode-badge-background, #313244);
      --assistant-bubble: var(--vscode-editor-background, #1e1e2e);
      --scrollbar: var(--vscode-scrollbarSlider-background, #45475a);
      --font: var(--vscode-font-family, 'Segoe UI', system-ui, sans-serif);
      --mono: var(--vscode-editor-font-family, 'Cascadia Code', 'Consolas', monospace);
      --radius: 8px;
      --radius-sm: 4px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font);
      font-size: 13px;
      background: var(--bg);
      color: var(--fg);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 3px; }
    ::-webkit-scrollbar-track { background: transparent; }
    #header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 10px;
      border-bottom: 1px solid var(--border);
      background: var(--bg2);
      flex-shrink: 0;
    }
    #header h1 { font-size: 12px; font-weight: 600; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.9; }
    .header-btn {
      background: none;
      border: 1px solid var(--border);
      color: var(--fg2);
      border-radius: var(--radius-sm);
      padding: 2px 7px;
      font-size: 11px;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s;
    }
    .header-btn:hover { background: var(--bg3); color: var(--fg); }
    .header-btn.primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
    .header-btn.primary:hover { opacity: 0.85; }
    #model-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-bottom: 1px solid var(--border);
      background: var(--bg2);
      flex-shrink: 0;
    }
    #model-bar label { font-size: 11px; color: var(--fg2); white-space: nowrap; }
    #model-select {
      flex: 1;
      background: var(--bg3);
      color: var(--fg);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 2px 6px;
      font-size: 11px;
    }
    #workspace-root {
      font-size: 10px;
      color: var(--fg2);
      font-family: var(--mono);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 160px;
      cursor: help;
    }
    #sessions-panel {
      background: var(--bg2);
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
      overflow: hidden;
      transition: max-height 0.2s ease;
      max-height: 140px;
    }
    #sessions-panel.collapsed { max-height: 28px; }
    #sessions-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 10px;
      cursor: pointer;
      font-size: 11px;
      color: var(--fg2);
      user-select: none;
      min-height: 24px;
    }
    #sessions-toggle:hover { color: var(--fg); }
    #sessions-list { overflow-y: auto; max-height: 112px; }
    .session-item {
      display: flex;
      align-items: center;
      padding: 4px 10px;
      cursor: pointer;
      font-size: 11px;
      gap: 6px;
      border-left: 2px solid transparent;
    }
    .session-item:hover { background: var(--bg3); }
    .session-item.active { border-left-color: var(--accent); background: var(--bg3); }
    .session-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .session-delete { opacity: 0; cursor: pointer; font-size: 10px; padding: 2px 4px; border-radius: 3px; }
    .session-item:hover .session-delete { opacity: 0.5; }
    .session-delete:hover { opacity: 1 !important; color: var(--error); }
    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .message { display: flex; flex-direction: column; gap: 4px; max-width: 100%; animation: fadeIn 0.15s ease; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    .message-role {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      opacity: 0.5;
      padding: 0 2px;
    }
    .message.user .message-role { color: var(--accent); }
    .message.assistant .message-role { color: var(--success); }
    .message.system .message-role, .message.tool .message-role { color: var(--fg2); }
    .message-body {
      background: var(--bg2);
      border-radius: var(--radius);
      padding: 10px 12px;
      line-height: 1.6;
      word-break: break-word;
      border: 1px solid var(--border);
    }
    .message.user .message-body { background: var(--user-bubble); border-color: transparent; }
    .message.assistant .message-body { background: var(--assistant-bubble); }
    .message-body pre {
      background: var(--bg3);
      border-radius: var(--radius-sm);
      padding: 10px 12px;
      overflow-x: auto;
      font-family: var(--mono);
      font-size: 12px;
      margin: 8px 0;
      border: 1px solid var(--border);
    }
    .message-body code { font-family: var(--mono); font-size: 12px; background: var(--bg3); padding: 1px 5px; border-radius: 3px; }
    .message-body pre code { background: none; padding: 0; }
    .message-body p { margin: 6px 0; }
    .message-body p:first-child { margin-top: 0; }
    .message-body p:last-child { margin-bottom: 0; }
    .message-body ul, .message-body ol { padding-left: 18px; margin: 6px 0; }
    .message-body li { margin: 2px 0; }
    .message-body h1,.message-body h2,.message-body h3,.message-body h4 { margin: 10px 0 4px; font-weight: 600; }
    .message-body h1 { font-size: 15px; }
    .message-body h2 { font-size: 13px; }
    .message-body h3,.message-body h4 { font-size: 12px; }
    .message-body blockquote { border-left: 3px solid var(--accent); padding-left: 10px; margin: 8px 0; opacity: 0.8; }
    .message-body strong { font-weight: 600; }
    .message-body em { font-style: italic; opacity: 0.9; }
    .message-body a { color: var(--accent); text-decoration: none; }
    .message-body a:hover { text-decoration: underline; }
    .message-body hr { border: none; border-top: 1px solid var(--border); margin: 10px 0; }
    .streaming-cursor { display: inline-block; width: 2px; height: 1em; background: var(--accent); margin-left: 2px; animation: blink 1s step-end infinite; vertical-align: text-bottom; }
    @keyframes blink { 50% { opacity: 0; } }
    #working-state {
      display: none;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      font-size: 11px;
      color: var(--fg2);
      background: var(--bg2);
      border-top: 1px solid var(--border);
      flex-shrink: 0;
    }
    #working-state.visible { display: flex; }
    .spinner { width: 12px; height: 12px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; flex-shrink: 0; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .patch-card {
      background: var(--bg3);
      border: 1px solid var(--border);
      border-left: 3px solid var(--warn);
      border-radius: var(--radius);
      padding: 10px 12px;
      margin-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .patch-card-title { font-weight: 600; font-size: 12px; display: flex; align-items: center; gap: 6px; }
    .patch-card-summary { font-size: 11px; color: var(--fg2); }
    .patch-edits { font-size: 11px; font-family: var(--mono); color: var(--fg2); white-space: pre-wrap; }
    .patch-actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .patch-btn { padding: 4px 10px; font-size: 11px; border-radius: var(--radius-sm); cursor: pointer; border: 1px solid; transition: all 0.15s; }
    .patch-btn.accept { background: var(--success); color: var(--bg); border-color: var(--success); }
    .patch-btn.accept:hover { opacity: 0.85; }
    .patch-btn.reject { background: none; color: var(--error); border-color: var(--error); }
    .patch-btn.reject:hover { background: var(--error); color: var(--bg); }
    .patch-btn.preview { background: none; color: var(--fg2); border-color: var(--border); }
    .patch-btn.preview:hover { color: var(--fg); border-color: var(--fg2); }
    .terminal-card {
      background: var(--bg3);
      border: 1px solid var(--border);
      border-left: 3px solid var(--error);
      border-radius: var(--radius);
      padding: 10px 12px;
      margin-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .terminal-card-title { font-weight: 600; font-size: 12px; display: flex; align-items: center; gap: 6px; }
    .terminal-command { font-family: var(--mono); font-size: 12px; background: var(--bg2); padding: 6px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border); }
    .terminal-risk { font-size: 11px; color: var(--warn); }
    .terminal-actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .term-btn { padding: 4px 10px; font-size: 11px; border-radius: var(--radius-sm); cursor: pointer; border: 1px solid; transition: all 0.15s; }
    .term-btn.run { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
    .term-btn.run:hover { opacity: 0.85; }
    .term-btn.always { background: none; color: var(--warn); border-color: var(--warn); }
    .term-btn.always:hover { background: var(--warn); color: var(--bg); }
    .term-btn.cancel { background: none; color: var(--error); border-color: var(--error); }
    .term-btn.cancel:hover { background: var(--error); color: var(--bg); }
    #empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      gap: 10px;
      color: var(--fg2);
      text-align: center;
      padding: 24px 16px;
      pointer-events: none;
    }
    #empty-state .icon { font-size: 36px; opacity: 0.35; }
    #empty-state h2 { font-size: 13px; font-weight: 600; opacity: 0.6; }
    #empty-state p { font-size: 11px; opacity: 0.45; line-height: 1.7; max-width: 210px; }
    #context-chips {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      padding: 5px 10px 2px;
      flex-shrink: 0;
    }
    .chip {
      display: flex;
      align-items: center;
      gap: 3px;
      padding: 2px 8px;
      font-size: 10px;
      border-radius: 999px;
      border: 1px solid var(--border);
      cursor: pointer;
      transition: all 0.15s;
      color: var(--fg2);
      background: var(--bg2);
      user-select: none;
    }
    .chip.active { border-color: var(--accent); color: var(--accent); background: rgba(137,180,250,0.12); }
    .chip:hover:not(.active) { border-color: var(--fg2); color: var(--fg); }
    #input-area {
      display: flex;
      flex-direction: column;
      gap: 5px;
      padding: 8px 10px;
      border-top: 1px solid var(--border);
      background: var(--bg2);
      flex-shrink: 0;
    }
    #prompt-input {
      width: 100%;
      min-height: 58px;
      max-height: 180px;
      background: var(--bg3);
      color: var(--fg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 8px 10px;
      font-family: var(--font);
      font-size: 13px;
      resize: none;
      line-height: 1.5;
      outline: none;
      transition: border-color 0.15s;
      overflow-y: auto;
    }
    #prompt-input:focus { border-color: var(--accent); }
    #prompt-input::placeholder { color: var(--fg2); opacity: 0.45; }
    #input-actions { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
    .input-hint { font-size: 10px; color: var(--fg2); opacity: 0.4; }
    #send-btn {
      background: var(--accent);
      color: var(--accent-fg);
      border: none;
      border-radius: var(--radius-sm);
      padding: 5px 14px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    #send-btn:hover:not(:disabled) { opacity: 0.85; }
    #send-btn:disabled { opacity: 0.35; cursor: not-allowed; }
    #stop-btn {
      display: none;
      background: none;
      color: var(--error);
      border: 1px solid var(--error);
      border-radius: var(--radius-sm);
      padding: 5px 10px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;
    }
    #stop-btn.visible { display: block; }
    #stop-btn:hover { background: var(--error); color: var(--bg); }
    .error-toast {
      background: rgba(243,139,168,0.12);
      border: 1px solid var(--error);
      border-radius: var(--radius);
      padding: 8px 12px;
      font-size: 11px;
      color: var(--error);
    }
  </style>
</head>
<body>

<div id="header">
  <h1>⚡ Local Code Agent</h1>
  <button class="header-btn" id="check-backend-btn" title="Check Ollama backend status">⚙ Status</button>
  <button class="header-btn primary" id="new-chat-btn">+ New</button>
</div>

<div id="model-bar">
  <label>Model:</label>
  <select id="model-select"></select>
  <span id="workspace-root" title=""></span>
</div>

<div id="sessions-panel">
  <div id="sessions-toggle">
    <span>💬 Chats</span>
    <span id="sessions-arrow">▾</span>
  </div>
  <div id="sessions-list"></div>
</div>

<div id="messages">
  <div id="empty-state">
    <div class="icon">🤖</div>
    <h2>Local Code Agent</h2>
    <p>Powered by Ollama — local, private, no cloud required.<br/>Start by typing a question below.</p>
  </div>
</div>

<div id="working-state">
  <div class="spinner"></div>
  <span id="working-label">Thinking…</span>
</div>

<div id="context-chips">
  <div class="chip" id="chip-file" title="Include active file content">📄 File</div>
  <div class="chip" id="chip-selection" title="Include current selection">✂️ Selection</div>
  <div class="chip" id="chip-tabs" title="Include open tab list">📑 Tabs</div>
</div>

<div id="input-area">
  <textarea id="prompt-input" placeholder="Ask about your code… (Ctrl+Enter to send)" rows="3"></textarea>
  <div id="input-actions">
    <span class="input-hint">Ctrl+Enter to send</span>
    <div style="display:flex;gap:6px">
      <button id="stop-btn" title="Stop generation">■ Stop</button>
      <button id="send-btn">Send ↑</button>
    </div>
  </div>
</div>

<script>
(function() {
  const vscode = acquireVsCodeApi();

  // ── State ────────────────────────────────────────────────────────────────
  const S = {
    sessions: [],
    activeSessionId: null,
    models: [],
    currentModel: '',
    workspaceRoot: '',
    streaming: false,
    streamBuffer: '',
    sessionsCollapsed: false,
    chips: { file: false, selection: false, tabs: false },
  };

  // ── DOM ──────────────────────────────────────────────────────────────────
  const $msg      = id => document.getElementById(id);
  const $messages = $msg('messages');
  const $input    = $msg('prompt-input');
  const $sendBtn  = $msg('send-btn');
  const $stopBtn  = $msg('stop-btn');
  const $working  = $msg('working-state');
  const $wLabel   = $msg('working-label');
  const $modelSel = $msg('model-select');
  const $wsRoot   = $msg('workspace-root');
  const $sesList  = $msg('sessions-list');
  const $sesPanel = $msg('sessions-panel');

  let streamEl = null;

  // ── Message bus ──────────────────────────────────────────────────────────
  window.addEventListener('message', ev => {
    const m = ev.data;
    switch (m.type) {
      case 'init':
        S.sessions = m.sessions || [];
        S.activeSessionId = m.activeSessionId;
        S.models = m.models || [];
        S.currentModel = m.currentModel || '';
        S.workspaceRoot = m.workspaceRoot || '';
        renderAll();
        break;
      case 'sessions':
        S.sessions = m.sessions || [];
        renderSessions();
        break;
      case 'sessionUpdate':
        { const i = S.sessions.findIndex(s => s.id === m.session.id);
          if (i >= 0) S.sessions[i] = m.session; else S.sessions.unshift(m.session);
          if (m.session.id === S.activeSessionId) renderMessages(m.session); }
        renderSessions();
        break;
      case 'streamToken':
        if (m.sessionId === S.activeSessionId) onToken(m.token);
        break;
      case 'streamDone':
        if (m.sessionId === S.activeSessionId) finalizeStream();
        break;
      case 'streamError':
        if (m.sessionId === S.activeSessionId) { finalizeStream(); showError(m.error); }
        break;
      case 'patchProposal':
        appendPatchCard(m.proposal);
        break;
      case 'terminalCommand':
        appendTerminalCard(m.command);
        break;
      case 'workingState':
        setWorking(m.state, m.label);
        break;
      case 'modelList':
        S.models = m.models || [];
        renderModelSelect();
        break;
      case 'error':
        showError(m.message);
        break;
    }
  });

  // ── Render ───────────────────────────────────────────────────────────────
  function renderAll() {
    renderModelSelect();
    renderSessions();
    $wsRoot.textContent = shortPath(S.workspaceRoot);
    $wsRoot.title = S.workspaceRoot;
    const active = S.sessions.find(s => s.id === S.activeSessionId);
    if (active && active.messages.length > 0) renderMessages(active);
  }

  function renderModelSelect() {
    const cur = S.currentModel || $modelSel.value || '';
    $modelSel.innerHTML = '';
    const models = S.models.length ? S.models : (cur ? [cur] : ['gemma4:e2b']);
    models.forEach(m => {
      const o = document.createElement('option');
      o.value = m; o.textContent = m;
      if (m === cur) o.selected = true;
      $modelSel.appendChild(o);
    });
    if (!models.includes(cur) && cur) {
      const o = document.createElement('option');
      o.value = cur; o.textContent = cur; o.selected = true;
      $modelSel.insertBefore(o, $modelSel.firstChild);
    }
  }

  function renderSessions() {
    $sesList.innerHTML = '';
    [...S.sessions].sort((a,b) => b.updatedAt - a.updatedAt).forEach(s => {
      const d = document.createElement('div');
      d.className = 'session-item' + (s.id === S.activeSessionId ? ' active' : '');
      d.innerHTML =
        '<span class="session-title" title="' + esc(s.title) + '">' + esc(s.title) + '</span>' +
        '<span class="session-delete" title="Delete">✕</span>';
      d.querySelector('.session-title').onclick = () => selectSession(s.id);
      d.querySelector('.session-delete').onclick = e => { e.stopPropagation(); deleteSession(s.id); };
      $sesList.appendChild(d);
    });
  }

  function renderMessages(session) {
    $messages.innerHTML = '';
    if (!session || !session.messages || session.messages.length === 0) {
      showEmptyState();
      return;
    }
    session.messages.forEach(m => {
      if (m.role === 'system') return;
      appendMsg(m.role, m.content, false);
    });
    scrollBottom();
  }

  function showEmptyState() {
    $messages.innerHTML = '';
    const d = document.createElement('div');
    d.id = 'empty-state';
    d.innerHTML =
      '<div class="icon">🤖</div>' +
      '<h2>Local Code Agent</h2>' +
      '<p>Powered by Ollama — local, private, no cloud required.<br/>Start by typing a question below.</p>';
    d.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;gap:10px;color:var(--fg2);text-align:center;padding:24px 16px;pointer-events:none;';
    $messages.appendChild(d);
  }

  // ── Message rendering ─────────────────────────────────────────────────────
  function appendMsg(role, content, scroll) {
    const es = document.getElementById('empty-state');
    if (es) es.remove();

    const wrap = document.createElement('div');
    wrap.className = 'message ' + role;
    const rl = document.createElement('div');
    rl.className = 'message-role';
    rl.textContent = role === 'user' ? 'You' : role === 'assistant' ? 'Agent' : role;
    const body = document.createElement('div');
    body.className = 'message-body';
    body.innerHTML = md(content);
    wrap.appendChild(rl);
    wrap.appendChild(body);
    $messages.appendChild(wrap);
    if (scroll !== false) scrollBottom();
    return wrap;
  }

  function startStream() {
    const es = document.getElementById('empty-state');
    if (es) es.remove();
    const wrap = document.createElement('div');
    wrap.className = 'message assistant';
    wrap.id = 'stream-wrap';
    const rl = document.createElement('div');
    rl.className = 'message-role';
    rl.textContent = 'Agent';
    const body = document.createElement('div');
    body.className = 'message-body';
    body.innerHTML = '<span class="streaming-cursor"></span>';
    wrap.appendChild(rl);
    wrap.appendChild(body);
    $messages.appendChild(wrap);
    streamEl = body;
    S.streamBuffer = '';
    scrollBottom();
  }

  function onToken(token) {
    if (!streamEl) startStream();
    S.streamBuffer += token;
    streamEl.innerHTML = md(S.streamBuffer) + '<span class="streaming-cursor"></span>';
    scrollBottom();
  }

  function finalizeStream() {
    if (streamEl) { streamEl.innerHTML = md(S.streamBuffer); streamEl = null; }
    S.streaming = false;
    setWorking('idle', '');
    $sendBtn.disabled = false;
    $stopBtn.classList.remove('visible');
    scrollBottom();
  }

  function showError(msg) {
    const d = document.createElement('div');
    d.className = 'error-toast';
    d.textContent = '⚠ ' + msg;
    $messages.appendChild(d);
    scrollBottom();
  }

  function appendPatchCard(proposal) {
    const editLines = (proposal.edits || []).map(e =>
      (e.operation || '?').toUpperCase() + ': ' + e.filePath + (e.startLine !== undefined ? ':' + (e.startLine+1) : '') + (e.description ? ' — ' + e.description : '')
    ).join('\\n');
    const card = document.createElement('div');
    card.className = 'patch-card';
    card.innerHTML =
      '<div class="patch-card-title"><span>📝</span> Proposed Edit</div>' +
      '<div class="patch-card-summary">' + esc(proposal.summary || '') + '</div>' +
      '<div class="patch-edits">' + esc(editLines) + '</div>' +
      '<div class="patch-actions">' +
        '<button class="patch-btn accept">✓ Accept All</button>' +
        '<button class="patch-btn preview">👁 Preview</button>' +
        '<button class="patch-btn reject">✕ Reject</button>' +
      '</div>';
    card.querySelector('.accept').onclick = () => {
      vscode.postMessage({ type: 'acceptPatch', proposalId: proposal.id });
      card.style.opacity = '0.5';
      card.querySelectorAll('button').forEach(b => b.disabled = true);
    };
    card.querySelector('.preview').onclick = () =>
      vscode.postMessage({ type: 'acceptPatch', proposalId: proposal.id + '__preview' });
    card.querySelector('.reject').onclick = () => {
      vscode.postMessage({ type: 'rejectPatch', proposalId: proposal.id });
      card.remove();
    };
    $messages.appendChild(card);
    scrollBottom();
  }

  function appendTerminalCard(cmd) {
    const card = document.createElement('div');
    card.className = 'terminal-card';
    card.innerHTML =
      '<div class="terminal-card-title"><span>⚡</span> Terminal Command</div>' +
      '<div class="terminal-command">$ ' + esc(cmd.command) + '</div>' +
      '<div class="terminal-risk">⚠ ' + esc(cmd.riskNote) + '</div>' +
      '<div class="terminal-actions">' +
        '<button class="term-btn run">▶ Run Once</button>' +
        '<button class="term-btn always">✓ Always Allow</button>' +
        '<button class="term-btn cancel">✕ Cancel</button>' +
      '</div>';
    const disable = () => { card.style.opacity='0.5'; card.querySelectorAll('button').forEach(b=>b.disabled=true); };
    card.querySelector('.run').onclick    = () => { vscode.postMessage({ type: 'approveCommand', commandId: cmd.id, alwaysAllow: false }); disable(); };
    card.querySelector('.always').onclick = () => { vscode.postMessage({ type: 'approveCommand', commandId: cmd.id, alwaysAllow: true });  disable(); };
    card.querySelector('.cancel').onclick = () => { vscode.postMessage({ type: 'rejectCommand', commandId: cmd.id }); card.remove(); };
    $messages.appendChild(card);
    scrollBottom();
  }

  // ── Working state ─────────────────────────────────────────────────────────
  function setWorking(state, label) {
    if (!state || state === 'idle') { $working.classList.remove('visible'); }
    else { $working.classList.add('visible'); $wLabel.textContent = label || 'Working…'; }
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  function selectSession(id) {
    S.activeSessionId = id;
    vscode.postMessage({ type: 'selectSession', sessionId: id });
    renderSessions();
    const s = S.sessions.find(x => x.id === id);
    if (s) renderMessages(s); else showEmptyState();
  }

  function deleteSession(id) {
    vscode.postMessage({ type: 'deleteSession', sessionId: id });
    S.sessions = S.sessions.filter(s => s.id !== id);
    if (S.activeSessionId === id) S.activeSessionId = S.sessions[0] ? S.sessions[0].id : null;
    renderSessions();
    const s = S.sessions.find(x => x.id === S.activeSessionId);
    if (s) renderMessages(s); else showEmptyState();
  }

  function send() {
    const content = $input.value.trim();
    if (!content || S.streaming) return;
    S.streaming = true;
    $sendBtn.disabled = true;
    $stopBtn.classList.add('visible');
    appendMsg('user', content);
    startStream();
    setWorking('generating', 'Generating…');
    vscode.postMessage({
      type: 'sendMessage',
      content,
      sessionId: S.activeSessionId,
      includeCurrentFile: S.chips.file,
      includeSelection: S.chips.selection,
      includeOpenTabs: S.chips.tabs,
    });
    $input.value = '';
    $input.style.height = '';
  }

  // ── Minimal Markdown renderer ─────────────────────────────────────────────
  function md(raw) {
    if (!raw) return '';
    // Extract code blocks first to protect them
    const blocks = [];
    let s = raw.replace(/\`\`\`(\\w*)\\n?([\\s\\S]*?)\`\`\`/g, (_, lang, code) => {
      blocks.push('<pre><code>' + esc(code) + '</code></pre>');
      return '\\x00BLOCK' + (blocks.length-1) + '\\x00';
    });
    s = esc(s);
    // Inline code
    s = s.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
    // Bold / italic
    s = s.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
    s = s.replace(/\\*(.+?)\\*/g, '<em>$1</em>');
    // Headings
    s = s.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    s = s.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    s = s.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    // HR
    s = s.replace(/^---+$/gm, '<hr>');
    // Lists
    s = s.replace(/((?:^[\\*\\-] .+\\n?)+)/gm, m =>
      '<ul>' + m.replace(/^[\\*\\-] (.+)$/gm, '<li>$1</li>') + '</ul>');
    s = s.replace(/((?:^\\d+\\. .+\\n?)+)/gm, m =>
      '<ol>' + m.replace(/^\\d+\\. (.+)$/gm, '<li>$1</li>') + '</ol>');
    // Paragraphs
    s = s.split(/\\n\\n+/).map(p => {
      p = p.trim();
      if (!p) return '';
      if (/^<(h[1-4]|ul|ol|hr|pre|blockquote)/.test(p)) return p;
      return '<p>' + p.replace(/\\n/g, '<br>') + '</p>';
    }).join('');
    // Restore blocks
    s = s.replace(/\\x00BLOCK(\\d+)\\x00/g, (_, i) => blocks[+i]);
    return s;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function scrollBottom() { requestAnimationFrame(() => { $messages.scrollTop = $messages.scrollHeight; }); }
  function shortPath(p) {
    if (!p) return '';
    return p.replace(/\\\\/g,'/').split('/').slice(-2).join('/');
  }

  // ── Event listeners ───────────────────────────────────────────────────────
  $msg('new-chat-btn').onclick = () => vscode.postMessage({ type: 'newChat' });
  $msg('check-backend-btn').onclick = () => vscode.postMessage({ type: 'checkBackend' });
  $sendBtn.onclick = send;
  $stopBtn.onclick = () => {
    vscode.postMessage({ type: 'stopGeneration' });
    finalizeStream();
  };
  $input.onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } };
  $input.oninput = () => { $input.style.height = 'auto'; $input.style.height = Math.min($input.scrollHeight, 180) + 'px'; };
  $modelSel.onchange = () => { vscode.postMessage({ type: 'changeModel', model: $modelSel.value }); S.currentModel = $modelSel.value; };
  $msg('sessions-toggle').onclick = () => {
    S.sessionsCollapsed = !S.sessionsCollapsed;
    $sesPanel.classList.toggle('collapsed', S.sessionsCollapsed);
    $msg('sessions-arrow').textContent = S.sessionsCollapsed ? '▸' : '▾';
  };
  ['file','selection','tabs'].forEach(k => {
    $msg('chip-' + k).onclick = () => {
      S.chips[k] = !S.chips[k];
      $msg('chip-' + k).classList.toggle('active', S.chips[k]);
    };
  });

  // ── Boot ──────────────────────────────────────────────────────────────────
  vscode.postMessage({ type: 'ready' });
})();
</script>
</body>
</html>`;
}
