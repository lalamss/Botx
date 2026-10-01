import * as assert from 'assert';
import { PerceptionEngine } from '../perception/perceptionEngine';
import { EventType } from '../eventFilter/eventTypes';
import type { AetherEvent } from '../eventFilter/event';

suite('PerceptionEngine', () => {
    test('shouldBroadcastDiagnostic respects cooldown and hash change', () => {
        const engine = new PerceptionEngine();
        const file = '/tmp/file.ts';
        const sig1 = 'file.ts_ error:5';
        const sig2 = 'file.ts_ error:6';
        assert.ok(engine.shouldBroadcastDiagnostic(file, sig1), 'first broadcast should be allowed');
        engine.recordDiagnosticNotification(file, sig1);
        assert.strictEqual(engine.shouldBroadcastDiagnostic(file, sig1), false, 'same hash within cooldown should be suppressed');
        assert.ok(engine.shouldBroadcastDiagnostic(file, sig2), 'different hash should be allowed even within cooldown');
    });

    test('shouldAnalyzeDocument suppresses blank and empty diagnostics', () => {
        const engine = new PerceptionEngine();
        const fakeDoc = { getText: () => '   \n  ' } as any;
        const fakeDoc2 = { getText: () => 'const a=1' } as any;
        assert.strictEqual(engine.shouldAnalyzeDocument(fakeDoc, [{ message: 'err' } as any]), false, 'blank doc should be suppressed');
        assert.strictEqual(engine.shouldAnalyzeDocument(fakeDoc2, [] as any), false, 'no diagnostics should be suppressed');
        assert.strictEqual(engine.shouldAnalyzeDocument(fakeDoc2, [{ message: 'err' } as any]), true);
    });

    test('computeDiagnosticBatchSignature is stable', () => {
        const engine = new PerceptionEngine();
        const sig1 = engine.computeDiagnosticBatchSignature('file:///tmp/a.ts', [
            { code: 'TS100', range: { start: { line: 5 } } } as any,
            { code: 'TS101', range: { start: { line: 3 } } } as any
        ]);
        const sig2 = engine.computeDiagnosticBatchSignature('file:///tmp/a.ts', [
            { code: 'TS101', range: { start: { line: 3 } } } as any,
            { code: 'TS100', range: { start: { line: 5 } } } as any
        ]);
        assert.strictEqual(sig1, sig2, 'order should not affect signature');
    });

    test('processDiagnosticBatch batches correctly', () => {
        const engine = new PerceptionEngine();
        let published: any = null;
        engine.getPublisher().subscribe((obs) => { published = obs; });
        const obs = engine.processDiagnosticBatch([
            { type: 'SYNTAX_ERROR', details: 'err', line: 1, column: 1, file: 'a.ts', language: 'ts', severity: 'Error', code: 'TS100' },
            { type: 'WARNING', details: 'warn', line: 2, column: 1, file: 'a.ts', language: 'ts', severity: 'Warning', code: 'TS200' }
        ], { file: 'a.ts', language: 'ts' });
        assert.ok(obs);
        assert.strictEqual(obs!.data.errorCount, 1);
        assert.strictEqual(obs!.data.warningCount, 1);
        assert.ok(published);
    });

    test('process filters unknown event', () => {
        const engine = new PerceptionEngine();
        let published = false;
        engine.getPublisher().subscribe(() => published = true);
        const event: AetherEvent = { id: '1', type: 'UNKNOWN' as any, timestamp: Date.now(), source: 'Test', payload: {} };
        engine.process(event);
        assert.strictEqual(published, false);
    });
});
