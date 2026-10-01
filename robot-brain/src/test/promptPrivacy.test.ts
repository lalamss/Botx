import * as assert from 'assert';
import { isAiDebugLoggingEnabled, buildPromptLogEntry } from '../explanation/aiExplanationEngine';

suite('AI prompt privacy', () => {
    const originalFlag = process.env.BOTX_DEBUG_AI;

    teardown(() => {
        if (originalFlag === undefined) {
            delete process.env.BOTX_DEBUG_AI;
        } else {
            process.env.BOTX_DEBUG_AI = originalFlag;
        }
    });

    test('debug logging is OFF by default (production never logs prompts)', () => {
        delete process.env.BOTX_DEBUG_AI;
        assert.strictEqual(isAiDebugLoggingEnabled(), false);
    });

    test('debug logging requires explicit BOTX_DEBUG_AI=true opt-in', () => {
        process.env.BOTX_DEBUG_AI = 'true';
        assert.strictEqual(isAiDebugLoggingEnabled(), true);
        process.env.BOTX_DEBUG_AI = '1';
        assert.strictEqual(isAiDebugLoggingEnabled(), false, 'only the exact value "true" opts in');
    });

    test('prompt log entry never contains prompt/source content', () => {
        const sensitivePrompt = 'File: secret.ts\nconst key = "GEMINI_API_KEY=AIzaXXXX";\nfix line 3';
        const entry = buildPromptLogEntry(sensitivePrompt);
        const serialized = JSON.stringify(entry);
        assert.ok(!('Prompt' in entry), 'entry must not have a Prompt field');
        assert.ok(!serialized.includes('GEMINI_API_KEY'), 'entry must not leak secrets');
        assert.ok(!serialized.includes('secret.ts'), 'entry must not leak file content');
        assert.strictEqual(entry['PromptLength'], String(sensitivePrompt.length));
    });
});
