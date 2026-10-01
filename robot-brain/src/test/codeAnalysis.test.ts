import * as assert from 'assert';
import { diagnosticSeverityToString, extractFunctionName, extractFunctionSnippet, buildSurroundingWindow, toValidExpression, VALID_EXPRESSIONS, CONTROL_KEYWORDS } from '../utils/codeAnalysis';
import * as vscode from 'vscode';

suite('codeAnalysis', () => {
    test('diagnosticSeverityToString maps severities', () => {
        assert.strictEqual(diagnosticSeverityToString(vscode.DiagnosticSeverity.Error), 'Error');
        assert.strictEqual(diagnosticSeverityToString(vscode.DiagnosticSeverity.Warning), 'Warning');
        assert.strictEqual(diagnosticSeverityToString(vscode.DiagnosticSeverity.Information), 'Information');
        assert.strictEqual(diagnosticSeverityToString(vscode.DiagnosticSeverity.Hint), 'Hint');
        assert.strictEqual(diagnosticSeverityToString(99 as any), 'Unknown');
    });

    test('extractFunctionName finds function', () => {
        const lines = ['function myFunc() {', '  return 1;', '}'];
        assert.strictEqual(extractFunctionName(lines, 0), 'myFunc');
        const lines2 = ['if (true) {', '  x();', '}'];
        assert.strictEqual(extractFunctionName(lines2, 0), 'block-1');
    });

    test('CONTROL_KEYWORDS contains expected', () => {
        assert.ok(CONTROL_KEYWORDS.has('if'));
        assert.ok(!CONTROL_KEYWORDS.has('myFunc'));
    });

    test('VALID_EXPRESSIONS includes happy', () => {
        assert.ok((VALID_EXPRESSIONS as readonly string[]).includes('happy'));
    });

    test('toValidExpression returns fallback for invalid', () => {
        assert.strictEqual(toValidExpression('invalid', 'neutral'), 'neutral');
        assert.strictEqual(toValidExpression('happy', 'neutral'), 'happy');
    });

    test('extractFunctionSnippet extracts block', () => {
        const doc = { getText: () => 'function foo() {\n  const a=1;\n  return a;\n}' } as any;
        const result = extractFunctionSnippet(doc, 2);
        assert.ok(result.name === 'foo');
        assert.ok(result.snippet.includes('const a=1'));
    });

    test('buildSurroundingWindow builds window', () => {
        const doc = {
            lineCount: 5,
            lineAt: (i: number) => ({ text: `line${i}` })
        } as any;
        const win = buildSurroundingWindow(doc, 2);
        assert.ok(win.includes('line'));
        assert.ok(win.includes('3:'));
    });
});
