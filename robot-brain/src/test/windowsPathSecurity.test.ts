import * as assert from 'assert';
import { isBlockedSystemRoot } from '../context/contextEngine';

suite('Windows/system path blocking (case-insensitive)', () => {
    test('blocks Windows system roots in any casing', () => {
        assert.strictEqual(isBlockedSystemRoot('c:\\windows\\system32\\evil.ts'), true);
        assert.strictEqual(isBlockedSystemRoot('C:\\WINDOWS\\System32\\evil.ts'.toLowerCase()), true);
        assert.strictEqual(isBlockedSystemRoot('c:\\system32\\drivers\\x.sys'), true);
    });

    test('blocks POSIX system roots', () => {
        assert.strictEqual(isBlockedSystemRoot('/etc/passwd'), true);
        assert.strictEqual(isBlockedSystemRoot('/proc/self/environ'), true);
        assert.strictEqual(isBlockedSystemRoot('/sys/kernel/debug'), true);
    });

    test('allows ordinary project and temp paths', () => {
        assert.strictEqual(isBlockedSystemRoot('/tmp/botx-test/file.ts'), false);
        assert.strictEqual(isBlockedSystemRoot('c:\\projects\\botx\\src\\index.ts'), false);
        assert.strictEqual(isBlockedSystemRoot('/home/user/code/app.js'), false);
    });

    test('does not over-block paths that merely share a prefix', () => {
        assert.strictEqual(isBlockedSystemRoot('/etcetera/file'), false);
        assert.strictEqual(isBlockedSystemRoot('c:\\windowsx\\file.ts'), false);
    });
});
