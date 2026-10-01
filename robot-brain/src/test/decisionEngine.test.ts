import * as assert from 'assert';
import { DecisionEngine } from '../decision/decisionEngine';
import { ContextType } from '../context/contextType';
import { DecisionType } from '../decision/decisionType';
import type { Context } from '../context/context';

function makeCtx(type: ContextType, data: Record<string, unknown> = {}): Context {
    return {
        id: 'ctx-1',
        type,
        confidence: 0.9,
        timestamp: Date.now(),
        sourceObservation: {} as any,
        data
    };
}

suite('DecisionEngine', () => {
    test('USER_STUCK_ON_ERROR yields SHOW_ERROR_HELP', () => {
        const engine = new DecisionEngine();
        let published: any = null;
        engine.getPublisher().subscribe((d) => published = d);
        engine.process(makeCtx(ContextType.USER_STUCK_ON_ERROR, { file: 'a.ts', line: 5, message: 'err', language: 'typescript' }));
        assert.ok(published);
        assert.strictEqual(published.type, DecisionType.SHOW_ERROR_HELP);
    });

    test('DIAGNOSTIC_ANALYSIS yields DO_NOTHING', () => {
        const engine = new DecisionEngine();
        let published = false;
        engine.getPublisher().subscribe(() => published = true);
        engine.process(makeCtx(ContextType.DIAGNOSTIC_ANALYSIS, {}));
        assert.strictEqual(published, false);
    });

    test('cooldown suppresses duplicate decisions', () => {
        const engine = new DecisionEngine();
        let count = 0;
        engine.getPublisher().subscribe(() => count++);
        const ctx = makeCtx(ContextType.FIXING_COMPILER_ERROR, { File: 'a.ts' });
        engine.process(ctx);
        assert.strictEqual(count, 1);
        engine.process(ctx);
        assert.strictEqual(count, 1, 'second should be on cooldown');
    });

    test('shouldNotifyDiagnostic respects hash and cooldown', () => {
        const engine = new DecisionEngine();
        assert.ok(engine.shouldNotifyDiagnostic('a.ts', 'sig1'));
        engine.recordDiagnosticNotification('a.ts', 'sig1');
        assert.strictEqual(engine.shouldNotifyDiagnostic('a.ts', 'sig1'), false);
        assert.ok(engine.shouldNotifyDiagnostic('a.ts', 'sig2'), 'different sig should allow');
    });

    test('forceCooldown blocks next decision', () => {
        const engine = new DecisionEngine();
        let count = 0;
        engine.getPublisher().subscribe(() => count++);
        engine.forceCooldown(DecisionType.SHOW_ERROR_HELP, 5000);
        engine.process(makeCtx(ContextType.USER_STUCK_ON_ERROR, { file: 'a.ts', line: 1, message: 'x' }));
        assert.strictEqual(count, 0, 'should be blocked by forced cooldown');
    });

    test('resetDiagnosticNotifyGate clears', () => {
        const engine = new DecisionEngine();
        engine.recordDiagnosticNotification('a.ts', 'sig1');
        engine.resetDiagnosticNotifyGate();
        assert.ok(engine.shouldNotifyDiagnostic('a.ts', 'sig1'));
    });
});
