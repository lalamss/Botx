import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ContextEngine } from '../context/contextEngine';
import { ObservationType } from '../perception/observationType';

function makeObs(file: string, language = 'typescript'): any {
    return {
        id: 'obs-test',
        type: ObservationType.DIAGNOSTIC_BATCH,
        timestamp: Date.now(),
        confidence: 0.9,
        source: 'Test',
        data: {
            File: file,
            Language: language,
            errors: [{ line: 1, message: 'err' }],
            warnings: [],
            totalDiagnostics: 1
        }
    };
}

suite('ContextEngine Security', () => {
    test('valid workspace file returns content (when allowed)', async () => {
        const engine = new ContextEngine();
        // Create temp file in OS tmpdir which is allowed when no workspace
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'botx-valid-'));
        const file = path.join(tmpDir, 'valid.ts');
        fs.writeFileSync(file, 'const a = 1;\n// comment');
        const ctx = await engine.buildDiagnosticContext(makeObs(file));
        assert.ok(typeof ctx.data.fileContent === 'string');
        assert.ok((ctx.data.fileContent as string).includes('const a = 1'));
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('path outside workspace is rejected', async () => {
        const engine = new ContextEngine();
        const outside = '/etc/passwd';
        const ctx = await engine.buildDiagnosticContext(makeObs(outside));
        assert.strictEqual(ctx.data.fileContent, '', 'outside workspace should be empty');
    });

    test('oversized file is truncated', async () => {
        const engine = new ContextEngine();
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'botx-oversize-'));
        const file = path.join(tmpDir, 'big.ts');
        // Create >256KB file
        const bigContent = 'a'.repeat(300 * 1024);
        fs.writeFileSync(file, bigContent);
        const ctx = await engine.buildDiagnosticContext(makeObs(file));
        const content = ctx.data.fileContent as string;
        assert.ok(content.length < bigContent.length, 'should be truncated');
        assert.ok(content.includes('truncated'));
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('missing file returns empty', async () => {
        const engine = new ContextEngine();
        const ctx = await engine.buildDiagnosticContext(makeObs('/tmp/nonexistent-botx-file-12345.ts'));
        assert.strictEqual(ctx.data.fileContent, '');
    });

    test('secret-like content is scrubbed', async () => {
        const engine = new ContextEngine();
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'botx-secret-'));
        const file = path.join(tmpDir, 'secret.ts');
        const secretContent = 'const key = "AIzaSyFakeKey123456789012345678901234567";\nconst pwd = "password= supersecret123";';
        fs.writeFileSync(file, secretContent);
        const ctx = await engine.buildDiagnosticContext(makeObs(file));
        const content = ctx.data.fileContent as string;
        assert.ok(!content.includes('AIzaSyFakeKey'), 'API key should be redacted');
        assert.ok(content.includes('[REDACTED]'));
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('sensitive path .env is rejected', async () => {
        const engine = new ContextEngine();
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'botx-sensitive-'));
        // Even if file exists, path with .env should be rejected
        const file = path.join(tmpDir, '.env');
        fs.writeFileSync(file, 'GEMINI_API_KEY=xyz');
        // For this test, we need workspace to allow tmpDir but sensitive check should block
        // Our isSensitivePath checks for .env segment, so it should be blocked
        const ctx = await engine.buildDiagnosticContext(makeObs(file));
        assert.strictEqual(ctx.data.fileContent, '', '.env should be blocked');
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });
});
