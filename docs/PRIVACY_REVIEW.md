# Privacy Review — BOTX AI Data Flow

## Data Flow
```
VS Code workspace file (trusted) 
  → ContextEngine.readFileContent (allowlist + size cap + sensitive path block + secret scrub)
  → buildDiagnosticContext (surroundingCode 3 lines per error, truncated to 12k chars, scrubbed)
  → DiagnosticAnalysisRequest { fileName, language, fileContent (scrubbed/truncated), surroundingCode, errors, resolvedDependenciesText }
  → GeminiAgentEngine / AIExplanationEngine / GitConflictEngine / ApiMigrationEngine (headers: x-goog-api-key)
  → BOTX (response: summary, fixes, expression)
```

## What Can Be Sent to Gemini
- **File content**: Only the file containing diagnostics, truncated to 12k chars / 2000 lines, scrubbed of secrets, only if inside workspace and not sensitive.
- **Surrounding code**: 3 lines above/below each error line, already scrubbed via fileContent.
- **Diagnostics**: `line`, `column`, `message`, `severity`, `code` (no file system paths beyond fileName).
- **Resolved dependencies**: Exported interfaces from imported files (via `AstDependencyResolver`), not full files.
- **Not sent**: Entire workspace, `.env` contents (blocked as sensitive path), `node_modules`, `.git`, oversized files, secrets, API keys.

## Verifications
- **Prompts not logged**: `Logger.pipelineTrace` logs only type/confidence/learner score, not prompt text. `AIExplanationEngine` logs `Final prompt: ${prompt.slice(0,500)}` — capped to 500 chars and not including full file in production? Actually it logs first 500 chars of prompt which may include file snippet — should be reduced or removed in prod to avoid raw source in logs. Current behavior logs only 500 chars, but still leaks snippet. **Recommendation**: scrub logging to not include fileContent (future hardening).
- **API keys never logged**: `Logger.info` redacts any key with `api`+`key`/`secret`/`token`. Gemini engines throw `Gemini API key not found` without including key. No `console.log` of key.
- **Source snippets not persisted**: File content is held only in memory for prompt and context; not written to disk, not cached beyond `Context` object lifetime. `WorkspaceContext` holds only `currentFile` path and metadata, not content.
- **WebSocket never contains Gemini credentials**: `sendToRobot` payloads are `ROBOT_STATE`, `ACTION`, `WINDOW_VISIBILITY`, etc. — grep confirms no `x-goog-api-key` or `GEMINI` in `websocketServer.ts` payloads.
- **IPC never exposes Gemini credentials**: `preload.js` exposes only `getAuthToken` (WebSocket token), not Gemini key. `ipcMain.handle('get-auth-token')` returns WebSocket token only. `SecretManager` is extension-only, never sent via IPC.
- **Errors do not leak secrets**: All `catch` blocks log `String(err)` which may contain messages but not keys (keys are not in error messages). No stack traces include key.

## Remaining Privacy Limitation (honest)
- Prompts **do** contain source code (necessary for AI fixes) and are sent to Google Gemini API. Users should be aware that file snippets (up to 12k chars) leave the local machine. No claim of “offline privacy” is made.
- `AIExplanationEngine.generateExplanation` logs `Final prompt` first 500 chars — in a strict privacy regime, this should be removed or scrubbed entirely. Currently it is capped but still present.
- No end-to-end encryption beyond HTTPS to Gemini; no local-only mode for AI.

## Recommendations
- Remove or gate `Logger.info("AI", { Prompt: prompt.slice(0,500) })` behind a debug flag.
- Add user-facing notice in README and extension activation that source is sent to Gemini.
- Consider opt-in setting `botx.aiEnabled` to disable Gemini for sensitive workspaces.
