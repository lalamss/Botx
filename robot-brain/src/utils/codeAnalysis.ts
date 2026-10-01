import * as vscode from 'vscode';

export const CONTROL_KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "return", "throw"]);

export const VALID_EXPRESSIONS = [
    'happy', 'sad', 'confused', 'thinking', 'neutral',
    'idle', 'worried', 'shocked', 'sleeping'
] as const;

export type ValidExpression = typeof VALID_EXPRESSIONS[number];

export function diagnosticSeverityToString(severity: vscode.DiagnosticSeverity): string {
    switch (severity) {
        case vscode.DiagnosticSeverity.Error:
            return "Error";
        case vscode.DiagnosticSeverity.Warning:
            return "Warning";
        case vscode.DiagnosticSeverity.Information:
            return "Information";
        case vscode.DiagnosticSeverity.Hint:
            return "Hint";
        default:
            return "Unknown";
    }
}

export function extractFunctionName(lines: string[], blockStart: number): string {
    const maxScan = Math.max(0, blockStart - 20);
    for (let i = blockStart; i >= maxScan; i--) {
        const text = lines[i].trim();
        const fn = text.match(/\bfunction\s+([A-Za-z_$][\w$]*)/);
        if (fn) return fn[1];
        const method = text.match(/([A-Za-z_$][\w$]*)\s*\([^)]*\)/);
        if (method && !CONTROL_KEYWORDS.has(method[1]) && (text.includes("{") || text.includes("=>"))) {
            return method[1];
        }
    }
    return `block-${blockStart + 1}`;
}

export function extractFunctionSnippet(document: vscode.TextDocument, cursorLine: number): { name: string; startLine: number; snippet: string } {
    const text = document.getText();
    const lines = text.split(/\r?\n/);
    const idx = Math.max(0, Math.min(lines.length - 1, cursorLine - 1));

    let blockStart = idx;
    let balance = 0;
    for (let i = idx; i >= 0; i--) {
        balance += (lines[i].match(/{/g) ?? []).length;
        balance -= (lines[i].match(/}/g) ?? []).length;
        if (balance > 0) { blockStart = i; break; }
    }

    let openCount = 0;
    let closeIdx = blockStart;
    for (let i = blockStart; i < lines.length; i++) {
        openCount += (lines[i].match(/{/g) ?? []).length;
        openCount -= (lines[i].match(/}/g) ?? []).length;
        if (openCount <= 0) { closeIdx = i; break; }
    }

    const MAX_LINES = 120;
    const start = Math.max(0, blockStart - 1);
    const end = Math.min(lines.length - 1, closeIdx + 1);
    const snippetLines = lines.slice(start, end + 1);
    const snippet = snippetLines.length > MAX_LINES
        ? snippetLines.slice(0, MAX_LINES).join("\n") + "\n// ... (truncated)"
        : snippetLines.join("\n");

    return { name: extractFunctionName(lines, blockStart), startLine: blockStart + 1, snippet };
}

export function buildSurroundingWindow(document: vscode.TextDocument, lineIndex: number): string {
    const start = Math.max(0, lineIndex - 5);
    const end = Math.min(document.lineCount - 1, lineIndex + 5);
    const parts: string[] = [];
    for (let i = start; i <= end; i++) {
        parts.push(`${String(i + 1).padStart(4)}: ${document.lineAt(i).text}`);
    }
    return parts.join("\n");
}

export function toValidExpression(value: unknown, fallback: ValidExpression = 'neutral'): ValidExpression {
    if (typeof value === 'string' && (VALID_EXPRESSIONS as readonly string[]).includes(value)) {
        return value as ValidExpression;
    }
    return fallback;
}
