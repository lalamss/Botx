import * as assert from 'assert';
import { GeminiAgentEngine } from '../ai/gemini';

suite('GeminiAgentEngine security', () => {
    let originalFetch: any;

    setup(() => {
        originalFetch = (global as any).fetch;
    });

    teardown(() => {
        (global as any).fetch = originalFetch;
    });

    test('uses header x-goog-api-key and URL does NOT contain key', async () => {
        let capturedUrl = '';
        let capturedHeaders: Record<string, string> = {};
        const fakeResponse = {
            ok: true,
            json: async () => ({
                candidates: [{ content: { parts: [{ text: '{"summary":"ok","expression":"HELPFUL","fixes":[]}' }] } }]
            })
        };
        (global as any).fetch = async (url: string, opts: any) => {
            capturedUrl = url;
            capturedHeaders = opts.headers;
            // ensure body is stringified JSON without key
            assert.ok(!opts.body.includes('test-api-key-123'), 'body should not leak key');
            return fakeResponse;
        };

        const engine = new GeminiAgentEngine('test-api-key-123');
        const result = await engine.analyzeMultipleErrors('file.ts', 'const a=1', [{ line: 1, column: 1, message: 'err', severity: 'Error' }]);

        assert.ok(!capturedUrl.includes('test-api-key-123'), `URL must not contain API key, got ${capturedUrl}`);
        assert.ok(!capturedUrl.includes('key='), 'URL must not contain key query param');
        assert.strictEqual(capturedHeaders['x-goog-api-key'], 'test-api-key-123');
        assert.strictEqual(capturedHeaders['Content-Type'], 'application/json');
        assert.strictEqual(result.expression, 'HELPFUL');
    });

    test('throws if apiKey missing', async () => {
        // mock fetch to ensure not called
        let fetchCalled = false;
        (global as any).fetch = async () => { fetchCalled = true; return { ok: true, json: async () => ({}) }; };
        const engine = new GeminiAgentEngine('');
        try {
            await engine.analyzeMultipleErrors('file.ts', 'code', [{ line: 1, column: 1, message: 'err', severity: 'Error' }]);
            assert.fail('should have thrown');
        } catch (err) {
            assert.ok((err as Error).message.includes('Gemini API key not found'));
            assert.strictEqual(fetchCalled, false);
        }
    });

    test('retry and header preserved on 401 handling', async () => {
        let callCount = 0;
        (global as any).fetch = async (url: string, opts: any) => {
            callCount++;
            assert.strictEqual(opts.headers['x-goog-api-key'], 'key401');
            return { ok: false, status: 401, json: async () => ({}) };
        };
        const engine = new GeminiAgentEngine('key401');
        let handlerStatus: number | undefined;
        engine.setApiErrorHandler((s) => handlerStatus = s);
        const result = await engine.analyzeMultipleErrors('f.ts', 'code', [{ line: 1, column: 1, message: 'e', severity: 'Error' }]);
        assert.strictEqual(result.expression, 'CONFUSED');
        assert.strictEqual(handlerStatus, 401);
    });
});
