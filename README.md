# 🤖 BotX — AI-Powered Developer Companion & Pair Programmer

BotX is an **autonomous AI-powered desktop companion** and **VS Code extension** that proactively assists developers while they code.

Unlike traditional AI assistants that wait for prompts, BotX continuously observes your development environment, understands project context, predicts issues before compilation, explains diagnostics, and provides **one-click Quick Fixes** directly inside VS Code.

The system combines an intelligent VS Code extension (**robot-brain**) with an interactive Electron desktop avatar (**robot-body**) connected through a real-time WebSocket communication layer.

---

# ✨ Features

* 🧠 Autonomous multi-agent cognitive architecture (ACES Engine)
* ⚡ Real-time diagnostic analysis
* 🔍 AST-aware contextual code understanding
* 💬 Interactive desktop avatar with live expressions
* 🛠️ One-click AI Quick Fixes
* 🔀 Intelligent Git merge conflict resolution
* 🛡️ Workspace environment validation
* 📦 Package and dependency inspection
* 🚀 Progressive developer assistance without interrupting workflow
* 🔄 Undo-safe code modifications using VS Code WorkspaceEdit

---

# 🏗️ Architecture

```
DigitalCompanion/
│
├── robot-brain/        # VS Code Extension Host
│   ├── Sensors
│   ├── ACES Engine
│   ├── AST Parser
│   ├── Gemini Integration
│   ├── Code Actions
│   └── WebSocket Server
│
├── robot-body/         # Electron Desktop Companion
│   ├── Avatar UI
│   ├── Speech Bubbles
│   ├── Expressions
│   └── Animation Engine
│
└── package.json
```

### Runtime Communication

```
                VS Code Extension
                (robot-brain)

 Sensors
     │
     ▼
Event Processing
     │
     ▼
Perception Agent
     │
     ▼
Context Builder
     │
     ▼
Gemini AI
     │
     ▼
Decision Engine
     │
     ▼
Behavior FSM
     │
     ▼
Motion Planner
     │
     ▼
WebSocket Server
          │
          │ ws://localhost:8055
          ▼
Electron Desktop Companion
        (robot-body)
```

---

# 🧠 ACES Cognitive Engine

BotX follows a four-agent cognitive architecture.

## 🔹 Perception Agent

Continuously monitors the developer workspace by collecting and batching events such as:

* Diagnostics
* Cursor movement
* File saves
* Workspace changes

The perception pipeline automatically debounces events (1.5s) to avoid unnecessary processing.

---

## 🔹 Context Agent

Builds rich contextual information before invoking AI.

Capabilities include:

* AST parsing
* Import dependency resolution
* Cross-file interface tracking
* Local code context extraction
* Surrounding line analysis

This dramatically improves prompt quality for AI reasoning.

---

## 🔹 Explanation Agent

Powered by **Gemini 2.0 Flash**, the Explanation Agent:

* Explains compiler errors
* Groups related diagnostics
* Generates intelligent fixes
* Produces undo-safe WorkspaceEdits
* Creates concise developer-friendly explanations

---

## 🔹 Decision Agent

Prevents BotX from becoming intrusive.

Responsibilities include:

* Cooldown management
* Rule evaluation
* Intervention scheduling
* Notification prioritization

---

# 🔄 Progressive Intervention System

Instead of interrupting developers immediately, BotX follows a three-stage intervention pipeline.

## Phase 1 — Silent Analysis

* Detects problems in the background
* Switches avatar into **Thinking** mode
* Does not interrupt typing

---

## Phase 2 — Proactive Guidance

When repeated issues are detected:

* Displays desktop speech bubbles
* Changes avatar expressions
* Summarizes detected problems
* Suggests possible solutions

---

## Phase 3 — Preferred Quick Fix

Injects an AI-powered **🤖 Fix with BotX** action into VS Code.

Features include:

* Highest priority Code Action
* Ctrl + . integration
* Undo support (Ctrl + Z)
* WorkspaceEdit based modifications

---

# 🛡️ Core Modules

## 🛡️ Workspace Environment Guardian

Automatically validates the development environment by checking:

* Missing `.env` variables
* `.env.template` consistency
* Missing packages
* `node_modules`
* Python virtual environments
* Occupied development ports

Provides one-click environment generation whenever possible.

---

## 🔀 Intent-Aware Git Merge Conflict Resolver

BotX understands both sides of a merge conflict.

Instead of simply choosing "Current" or "Incoming", it:

* Detects conflict markers
* Analyzes branch intent
* Uses Gemini reasoning
* Produces a clean merged implementation

---

## ⚡ Library Deprecation & API Shield

Continuously scans projects for deprecated APIs using AST parsing.

Supported languages:

* TypeScript
* JavaScript
* Python
* Java
* Go

Provides modern replacements through Quick Fixes.

---

## 🎯 Stuck-State Detection

BotX detects when a developer may need assistance.

Examples include:

* Saving the same file multiple times in a short period
* Repeated compiler failures
* Extended idle focus on the same error
* Repetitive editing behavior

The assistant then proactively offers help.

---

# 🛠️ Getting Started

## Prerequisites

* Node.js 18+
* Visual Studio Code
* Gemini API Key

---

## Installation

Clone the repository.

```bash
git clone https://github.com/MudadlaPranay12/BotX.git

cd BotX
```

Install all workspace dependencies.

```bash
npm install
```

### Secure Gemini Credential Setup (Primary)

BotX stores your Gemini API key in **VS Code SecretStorage** (encrypted, OS keychain-backed), not in plain text files.

1. In VS Code, open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **BotX: Set API Key**.
2. Paste your key (get a free key at https://aistudio.google.com/app/apikey). It is saved via `SecretManager` → `context.secrets`.
3. The extension will confirm “Gemini API configured” in the Output channel.

> **Do not** commit `.env` with real keys. `.env` is ignored (see `.gitignore`). The only `.env` needed is a template (`.env.example`/`.env.template`) for workspace setup via **BotX: Setup Workspace Environment**.

### CI / Test-only fallback (explicit)

If you need environment-based keys for CI or deterministic tests, set:

```bash
BOTX_ALLOW_ENV_API_KEY=true
GEMINI_API_KEY=your_key
```

The fallback is **gated** — `SecretManager.getGeminiApiKey()` only reads `process.env` when `BOTX_ALLOW_ENV_API_KEY=true`. Never rely on plain `.env` for normal use.

---

## Running BotX

> **Open the repository ROOT in VS Code** (`D:\Botx 1\BotX-main` — not a
> subfolder). The debug configuration lives in the root `.vscode/launch.json`
> and points the Extension Host at `robot-brain`. Opening only
> `robot-brain/` (or a single file) will not offer the correct launch
> configuration, and starting the companion without the Extension Host is
> exactly what leaves the floating window stuck on `RECONNECTING`.

### 1. Compile the VS Code Extension

```bash
cd robot-brain

npm run compile
```

### 2. Launch Extension Development Host (starts the brain + WebSocket server)

In VS Code (root folder open), open **Run and Debug** (`Ctrl+Shift+D`),
select **“Run Robot Brain Extension”**, and press **F5**.

This runs the `npm: compile-brain` pre-launch build and starts a new
Extension Development Host window with the brain activated. On activation the
brain listens on `127.0.0.1:8055` and writes the auth token to
`os.tmpdir()/botx-ws-token`. Confirm in the **Aether** output channel:

```text
[WEBSOCKET] Server started ... Port: 8055 ... Host: 127.0.0.1
```

### 3. Start the Desktop Companion (after the server is listening)

```bash
cd ../robot-body

npm start
```

The floating window should change from `RECONNECTING` to `CONNECTED`.
If it stays on `RECONNECTING`, the Extension Host is not running or the
extension failed to activate — check the **Aether** output channel for a
`STARTUP ... Startup step failed` entry naming the failing step.

---

# 🗺️ Roadmap

## Completed

* ✅ Monorepo architecture
* ✅ Dual-process WebSocket communication
* ✅ ACES 4-Agent Cognitive Engine
* ✅ 13 Workspace Sensors
* ✅ Progressive Intervention FSM
* ✅ Workspace Environment Guardian
* ✅ Intent-Aware Merge Conflict Resolver
* ✅ Library Deprecation & API Shield

## In Progress

* ⏳ Live Terminal Autopilot
* ⏳ Command Guard
* ⏳ Build Error Interception

## Planned

* 🔲 Proactive Unit Test Generation
* 🔲 Regression Test Generation
* 🔲 Multi-File Cross-Module Refactoring
* 🔲 Autonomous Code Review Engine

---

# 💡 Tech Stack

**Frontend**

* Electron
* HTML
* CSS
* TypeScript

**Backend**

* Node.js
* VS Code Extension API
* WebSocket

**AI**

* Gemini 2.0 Flash

**Parsing**

* AST Analysis

**Architecture**

* Multi-Agent System
* Finite State Machine (FSM)
* Event-Driven Pipeline

---

# 🔐 Security Architecture

## Electron Security Model (robot-body)
- `main.js` `webPreferences`: `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`, `enableRemoteModule:false`, `preload: preload.js`
- `preload.js` exposes a **narrow** `contextBridge` API: `window.botx.window.{minimize,close,setPosition}`, `window.botx.onBrainEvent(handler)`, `window.botx.events.subscribe`, `window.botx.getAuthToken()` — no generic `send(channel,payload)`, no `require`, no `ipcRenderer` direct access. All channels are allow-listed and validated (`validateNumber`, etc.).
- Renderer (`index.html`) uses `textContent` only, never `innerHTML`, validates incoming `ROBOT_STATE`/`ACTION` messages via `isValidBrainMessage` allowlist, and sanitizes speech before display.
- No `eval`, `new Function`, `remote`, `webContents` arbitrary execution.

## Gemini API Key Handling
- Primary Store: **VS Code SecretStorage** via `SecretManager` (`context.secrets`). Never in URL query string, logs, WebSocket, IPC, or committed files.
- Transport: `x-goog-api-key` header (`fetch` with `headers: { "x-goog-api-key": key }`), URL never contains `?key=`. Tests assert URL does not contain key.
- Logging: `Logger` redacts any key containing `api`+`key`/`secret`/`token` → `[REDACTED]`.
- Fallback: `process.env.GEMINI_API_KEY` only when `BOTX_ALLOW_ENV_API_KEY=true` (CI/test). Documented as explicit opt-in.

## WebSocket Companion Link (robot-brain ↔ robot-body)
- **Binding:** `127.0.0.1:8055` only (never `0.0.0.0`). Verified via `WebSocketServer({ host: '127.0.0.1' })`.
- **Authentication:** Shared token `crypto.randomBytes(32).hex` generated on first start, written `0o600` to `os.tmpdir()/botx-ws-token`, exposed to renderer via `ipcMain.handle('get-auth-token')`. Renderer connects via `ws://127.0.0.1:8055?token=...` with `timingSafeEqual` validation; unauthorized → `4401`, bad origin → `4403`.
- **Origin validation:** Only `null`/`file://` or `localhost/127.0.0.1/::1` allowed.
- **Message validation:** Every incoming message is `JSON.parse` + schema-checked (`ALLOWED_MESSAGE_TYPES`, `type`, `relativeX/Y` numbers), `MAX_MESSAGE_SIZE 64KB` enforced, unknown/malformed payloads are dropped and logged without crash. No port auto-increment — `EADDRINUSE` fails clearly.

## Workspace File Handling (ContextEngine)
- Reads only files **inside** the open workspace (`isPathInsideWorkspace`), rejects outside paths, sensitive segments (`.git`, `node_modules`, `.env`, `package-lock.json`), and oversized files (`>256KB` → truncated to 12k chars). Secrets are scrubbed via `SECRET_PATTERNS` → `[REDACTED]` before Gemini prompt.

## Unit-Test Strategy
-Deterministic, no network/real key. VS Code APIs are stubbed for plain-mocha runs via `robot-brain/.mocha-setup.cjs` (loaded with `mocha --require ./.mocha-setup.cjs` by the `test:unit` script), so `require('vscode')` resolves outside the Extension Host. Gemini mocked via `global.fetch` capture. WebSocket tests use real `ws` server on `127.0.0.1:18055` with token auth. Coverage now includes `SecretManager`, `Gemini`, `WebSocket`, `Perception`, `Context`, `Decision`, `Behaviour`, `Motion`, `codeAnalysis`, sensors (`Environment`, `ImportInspector`, `GitConflict`), pipeline integration (`Observation→Motion`), plus `safeStartupStep`, AI prompt-privacy gating, and case-insensitive system-path blocking.

## MVP Limitations & Production Readiness
- **Limitations:** No remote companion mode (localhost only), no Zod runtime schema for all payloads (manual validation), `extension.ts` still ~1030 lines (activation hardened: server starts first, each sensor start is isolated via `safeStartupStep`, commands registered centrally via `commandRegistry`; the extracted `DiagnosticPipeline` class is available but the inline flow remains for incremental migration), `aether-companion` legacy duplicate exists (to be removed), `npm audit` shows dev-only `diff`/`serialize-javascript` vulns via the `mocha` chain (no prod impact — do not `audit fix --force`).
- **Not production-ready** until manual runtime QA (floating window, drag, IPC, WebSocket auth, deactivate cleanup) is performed on target OS, `aether-companion` removed, and sensor/integration tests expanded. All **critical security issues (C1-C4) are FIXED and verified**.

---

# 📄 License

Licensed under the **MIT License**.

---

> **BotX aims to redefine developer productivity by combining proactive AI reasoning, contextual understanding, and real-time workspace awareness into a seamless coding companion.**
