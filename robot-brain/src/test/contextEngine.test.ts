import * as assert from 'assert';
import { ContextEngine } from '../context/contextEngine';
import { ObservationType } from '../perception/observationType';
import type { Observation } from '../perception/observation';
import { ContextType } from '../context/contextType';

function makeObs(type: ObservationType, data: Record<string, unknown> = {}): Observation {
    return {
        id: `obs-${Date.now()}`,
        type,
        timestamp: Date.now(),
        confidence: 0.9,
        source: 'Test',
        data
    };
}

suite('ContextEngine', () => {
    test('processes FILE_OPENED to READING_CODE', () => {
        const engine = new ContextEngine();
        let published: any = null;
        engine.getPublisher().subscribe((ctx) => { published = ctx; });
        engine.process(makeObs(ObservationType.FILE_OPENED, { File: 'a.ts', Language: 'typescript' }));
        assert.ok(published);
        assert.strictEqual(published.type, ContextType.EDITING_TYPESCRIPT);
    });

    test('DIAGNOSTIC_BATCH does not publish via process', () => {
        const engine = new ContextEngine();
        let published = false;
        engine.getPublisher().subscribe(() => published = true);
        engine.process(makeObs(ObservationType.DIAGNOSTIC_BATCH, {}));
        assert.strictEqual(published, false);
    });

    test('stuck detection after repeated errors', () => {
        const engine = new ContextEngine();
        let stuckPublished: any = null;
        engine.getPublisher().subscribe((ctx) => {
            if (ctx.type === ContextType.USER_STUCK_ON_ERROR) stuckPublished = ctx;
        });
        const obs = makeObs(ObservationType.ERROR_DETECTED, { File: 'a.ts', Line: 10, Message: 'semicolon missing', details: 'semicolon missing' });
        // simulate 3 times quickly – but stuck threshold is 3000ms, so we need to manipulate time
        // We'll manually set firstSeen in past by directly testing checkStuckOnError via process twice with delay simulated via Date.now mock
        const originalNow = Date.now;
        let now = 1000;
        (Date as any).now = () => now;
        engine.process(obs);
        now += 100;
        engine.process(obs);
        now += 3100;
        engine.process(obs);
        (Date as any).now = originalNow;
        assert.ok(stuckPublished, 'should emit USER_STUCK_ON_ERROR after threshold');
        assert.strictEqual(stuckPublished.data.file, 'a.ts');
    });

    test('buildDiagnosticContext handles empty file', async () => {
        const engine = new ContextEngine();
        const obs = makeObs(ObservationType.DIAGNOSTIC_BATCH, {
            File: '/tmp/fake.ts',
            Language: 'typescript',
            errors: [{ line: 1, message: 'err' }],
            warnings: [],
            totalDiagnostics: 1
        });
        const ctx = await engine.buildDiagnosticContext(obs);
        assert.strictEqual(ctx.type, ContextType.DIAGNOSTIC_ANALYSIS);
        assert.ok(typeof ctx.data.fileContent === 'string');
    });

    test('language mapping resolves python', () => {
        const engine = new ContextEngine();
        let published: any = null;
        engine.getPublisher().subscribe((c) => published = c);
        engine.process(makeObs(ObservationType.FILE_OPENED, { File: 'main.py', Language: 'python' }));
        assert.strictEqual(published.type, ContextType.EDITING_PYTHON);
    });
});
