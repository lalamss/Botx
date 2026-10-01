import * as assert from 'assert';
import { safeStartupStep } from '../utils/startup';

suite('safeStartupStep (activation resilience)', () => {
    test('returns true and runs the step when it succeeds', () => {
        let ran = false;
        const ok = safeStartupStep('test-step', () => { ran = true; });
        assert.strictEqual(ok, true);
        assert.strictEqual(ran, true);
    });

    test('returns false instead of throwing when a sensor fails', () => {
        const ok = safeStartupStep('broken-sensor', () => {
            throw new Error('sensor exploded');
        });
        assert.strictEqual(ok, false, 'a throwing startup step must not propagate');
    });

    test('a failing step does not prevent later steps from running', () => {
        const order: string[] = [];
        safeStartupStep('first-broken', () => { throw new Error('boom'); });
        const ok = safeStartupStep('second-healthy', () => { order.push('second'); });
        assert.strictEqual(ok, true);
        assert.deepStrictEqual(order, ['second']);
    });
});
