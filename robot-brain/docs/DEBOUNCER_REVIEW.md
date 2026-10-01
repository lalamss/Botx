# Debouncer Review — BOTX

## Summary
BOTX uses multiple debouncers to batch rapid developer events and avoid hammering Gemini, WebSocket, and UI. All are trailing-edge.

## Inventory

| Debouncer | Location | Controls | Delay | Why | Overlap Risk | Event Loss? | Gemini Duplication? |
|---|---|---|---|---|---|---|---|
| `diagnosticDebouncer` | `extension.ts` + `pipeline/diagnosticPipeline.ts` (shared) | `onDidChangeDiagnostics`, `onDidChangeActiveTextEditor`, `onDidChangeTextDocument`, `onDidSaveTextDocument` | 1500ms | Batch typing/saving/diagnostics into one diagnostic analysis; wait for pause before 4-agent pipeline | Overlaps with `apiMigrationDebouncer` but separate keys (`diagnostics` vs `deprecated-api`) so no collision | No — trailing edge retains last event; rapid events coalesce | No — signature dedup (`computeDiagnosticBatchSignature` + `shouldBroadcastDiagnostic` 30s cooldown) prevents duplicate Gemini calls for same error set |
| `apiMigrationDebouncer` | `extension.ts` | `DEPRECATED_API_DETECTED` → speech bubble | 1200ms | Delay warning bubble until pause; Phase1 is silent | Separate key, no overlap with diagnostic debouncer | No | No — speech only, no Gemini (Gemini for migration is on-demand via Quick Fix) |
| `EnvironmentSensor` debouncer | `sensors/environmentSensor.ts` | `onDidCreate/Change/Delete` for `.env*` and `package.json` | 500ms | Batch file-system watcher bursts (npm install writes many files) | Independent instance, own key `environment` | No | N/A |
| `GitConflictSensor` debouncer | `sensors/gitConflictSensor.ts` | `onDidChangeActiveTextEditor`, `onDidChangeTextDocument` scan | 400ms | Debounce conflict marker scanning (block parse) | Per-file key `uri.fsPath` — no cross-file overlap | No — scan debounced per file | N/A |
| `ImportInspector` debouncer | `sensors/importInspector.ts` | Active editor switch vs document change | 0ms (switch) / 1200ms (change) | Fast scan on switch, slow on typing to keep typing responsive | Per-file key `import:fsPath` | No | N/A — AST scan only, no Gemini until migration |
| `IdleCodeFocusSensor` timer | `sensors/idleCodeFocusSensor.ts` | `onDidChangeTextEditorSelection` cursor dwell | 45000ms | Detect stuck state only after 45s dwell | Single timer per sensor, reset on selection change — no overlap | No — timer reset is intentional | Calls Gemini only once per stuck episode, gated by `onStuckObservation` + FSM busy check |
| `Diagnostic notify cooldown` | `PerceptionEngine` + `DecisionEngine` + `ContextEngine` | `shouldBroadcastDiagnostic` / `shouldNotifyDiagnostic` | 30000ms | Suppress duplicate speech bubbles for unchanged error set | Per-file hash; different errors bypass immediately | Intentional suppression — same error set is intentional loss inside cooldown | Prevents duplicate Gemini prompts |
| `MotionController` cooldown | `motionController/motionController.ts` | `MotionType.CHANGE_EXPRESSION` etc | 2000ms | Avoid rapid expression flicker | Per-motion-type map with TTL eviction | Skipped motions are intentional (cooldown) | N/A |

## Consolidation Decision
**No consolidation needed.** Each debouncer controls a distinct domain with distinct delay requirements. The only risk was multiple diagnostics debouncers firing per keystroke — this is mitigated by sharing a single `diagnosticDebouncer` instance between `extension.ts` and `DiagnosticPipeline` (passed explicitly). Merging environment/git/import debouncers would increase false negatives (e.g., env watcher 500ms vs diagnostics 1500ms).

## Event Loss & Duplication Guarantees
- **Lost events:** Only intentional suppression (duplicate hash inside cooldown, warnings-only). All other events are trailing-edge coalesced — last event always fires.
- **Gemini duplication:** Prevented by two layers: (1) diagnostic debounce batches rapid changes, (2) signature dedup prevents same `code:line` set from re-querying Gemini within 30s.
- **Oversized payload:** `MAX_MESSAGE_SIZE 64KB` rejects before processing.

## Recommendation
Keep as-is. Future improvement: move `diagnosticDebouncer` ownership fully to `DiagnosticPipeline` and expose `clear()` for `deactivate()` (already done via shared instance).
