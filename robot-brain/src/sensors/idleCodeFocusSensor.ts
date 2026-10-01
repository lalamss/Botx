import * as vscode from 'vscode';
import { EventFilter } from '../eventFilter/eventFilter';
import { EventType } from '../eventFilter/eventTypes';
import { AetherEvent } from '../eventFilter/event';
import { Logger } from '../utils/logger';
import { extractFunctionSnippet } from '../utils/codeAnalysis';

const IDLE_FOCUS_MS = 45000;

const IGNORED_URI_SCHEMES = new Set(["output", "vscode", "vscode-userdata", "git"]);

interface FunctionContext {
    name: string;
    startLine: number;
    snippet: string;
}

/**
 * Detects a developer stuck on a single function/block. When the cursor stays
 * on the same enclosing function/block for > 45 seconds while the editor and
 * window are active, a STUCK_IDLE_FOCUS observation is emitted to the
 * Perception Engine.
 */
export class IdleCodeFocusSensor {
    private eventFilter: EventFilter;
    private currentContextKey: string = "";
    private focusStartTime: number = 0;
    private focusTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(eventFilter: EventFilter) {
        this.eventFilter = eventFilter;
    }

    public start(context: vscode.ExtensionContext): void {
        Logger.info("IDLE CODE FOCUS SENSOR", {
            "Event": "Started"
        });

        const selectionListener = vscode.window.onDidChangeTextEditorSelection((event) => {
            this.onSelectionChange(event);
        });
        const editorListener = vscode.window.onDidChangeActiveTextEditor(() => {
            this.reset();
        });
        const windowListener = vscode.window.onDidChangeWindowState((state) => {
            if (!state.focused) {
                this.reset();
            }
        });

        context.subscriptions.push(selectionListener, editorListener, windowListener);
    }

    private onSelectionChange(event: vscode.TextEditorSelectionChangeEvent): void {
        const editor = event.textEditor;
        if (editor !== vscode.window.activeTextEditor) {
            this.reset();
            return;
        }

        const document = editor.document;
        if (!this.isSourceDocument(document)) {
            return;
        }

        const selection = event.selections[0];
        if (!selection) {
            return;
        }

        const key = this.buildContextKey(document, selection.active.line);

        if (key !== this.currentContextKey) {
            this.currentContextKey = key;
            this.focusStartTime = Date.now();
            this.scheduleTimer();
        }
    }

    private scheduleTimer(): void {
        if (this.focusTimer) {
            clearTimeout(this.focusTimer);
        }
        this.focusTimer = setTimeout(() => {
            this.focusTimer = undefined;
            this.checkIdleFocus();
        }, IDLE_FOCUS_MS);
    }

    private checkIdleFocus(): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !vscode.window.state.focused || !this.currentContextKey) {
            return;
        }

        const elapsed = Date.now() - this.focusStartTime;
        if (elapsed >= IDLE_FOCUS_MS) {
            this.publishStuck(editor, this.currentContextKey);
            this.focusStartTime = Date.now();
            this.scheduleTimer();
        }
    }

    private publishStuck(editor: vscode.TextEditor, contextKey: string): void {
        const document = editor.document;
        const selection = editor.selection;
        const line = selection.active.line + 1;

        const fnContext = this.extractFunctionContext(document, line);

        const event: AetherEvent = {
            id: `stuck-idle-focus-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: EventType.STUCK_IDLE_FOCUS,
            timestamp: Date.now(),
            source: "IdleCodeFocusSensor",
            payload: {
                File: document.fileName,
                Language: document.languageId,
                Line: line,
                Column: selection.active.character + 1,
                Function: fnContext.name,
                FunctionCode: fnContext.snippet,
                DurationMs: IDLE_FOCUS_MS,
                Reason: "Cursor remained on the same function/block while active"
            }
        };

        this.eventFilter.publish(event);

        Logger.info("IDLE CODE FOCUS SENSOR", {
            "Event": "Stuck Detected (Idle Focus)",
            "File": document.fileName.split("\\").pop()?.split("/").pop() || "unknown",
            "Language": document.languageId,
            "Line": String(line),
            "Function": fnContext.name,
            "DurationMs": String(IDLE_FOCUS_MS)
        });
    }

    private buildContextKey(document: vscode.TextDocument, line: number): string {
        const fnContext = this.extractFunctionContext(document, line + 1);
        return `${document.uri.fsPath}:${fnContext.startLine}:${fnContext.name}`;
    }

    private extractFunctionContext(document: vscode.TextDocument, line: number): FunctionContext {
        const result = extractFunctionSnippet(document, line);
        return { name: result.name, startLine: result.startLine, snippet: result.snippet };
    }

    private isSourceDocument(document: vscode.TextDocument): boolean {
        return !IGNORED_URI_SCHEMES.has(document.uri.scheme);
    }

    private reset(): void {
        if (this.focusTimer) {
            clearTimeout(this.focusTimer);
        }
        this.focusTimer = undefined;
        this.currentContextKey = "";
        this.focusStartTime = 0;
    }
}