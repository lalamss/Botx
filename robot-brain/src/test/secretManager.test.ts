import * as assert from 'assert';
import { SecretManager, GEMINI_API_KEY_SECRET } from '../utils/secretManager';

function createFakeContext(stored?: string) {
    let value = stored;
    return {
        secrets: {
            get: async (key: string) => {
                assert.strictEqual(key, GEMINI_API_KEY_SECRET);
                return value;
            },
            store: async (key: string, val: string) => { value = val; },
            delete: async (key: string) => { value = undefined; }
        },
        get stored() { return value; },
        set stored(v: string | undefined) { value = v; }
    } as any;
}

suite('SecretManager', () => {
    const originalEnv = process.env.GEMINI_API_KEY;
    const originalAllow = process.env.BOTX_ALLOW_ENV_API_KEY;

    teardown(() => {
        if (originalEnv === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = originalEnv;
        if (originalAllow === undefined) delete process.env.BOTX_ALLOW_ENV_API_KEY;
        else process.env.BOTX_ALLOW_ENV_API_KEY = originalAllow;
    });

    test('returns stored secret when present', async () => {
        const ctx = createFakeContext('secret123');
        const mgr = new SecretManager(ctx);
        const key = await mgr.getGeminiApiKey();
        assert.strictEqual(key, 'secret123');
    });

    test('does NOT fallback to env by default (secure)', async () => {
        const ctx = createFakeContext(undefined);
        process.env.GEMINI_API_KEY = 'env-key-should-not-be-used';
        delete process.env.BOTX_ALLOW_ENV_API_KEY;
        const mgr = new SecretManager(ctx);
        const key = await mgr.getGeminiApiKey();
        assert.strictEqual(key, undefined);
    });

    test('falls back to env only when BOTX_ALLOW_ENV_API_KEY=true (CI mode)', async () => {
        const ctx = createFakeContext(undefined);
        process.env.GEMINI_API_KEY = 'env-key-allowed';
        process.env.BOTX_ALLOW_ENV_API_KEY = 'true';
        const mgr = new SecretManager(ctx);
        const key = await mgr.getGeminiApiKey();
        assert.strictEqual(key, 'env-key-allowed');
    });

    test('prefers stored secret over env even in CI mode', async () => {
        const ctx = createFakeContext('stored-preferred');
        process.env.GEMINI_API_KEY = 'env-key';
        process.env.BOTX_ALLOW_ENV_API_KEY = 'true';
        const mgr = new SecretManager(ctx);
        const key = await mgr.getGeminiApiKey();
        assert.strictEqual(key, 'stored-preferred');
    });

    test('setGeminiApiKey trims value', async () => {
        const ctx = createFakeContext(undefined);
        const mgr = new SecretManager(ctx);
        await mgr.setGeminiApiKey('  my-key  ');
        assert.strictEqual(ctx.stored, 'my-key');
    });

    test('clear deletes secret', async () => {
        const ctx = createFakeContext('to-delete');
        const mgr = new SecretManager(ctx);
        await mgr.clearGeminiApiKey();
        assert.strictEqual(ctx.stored, undefined);
    });
});
