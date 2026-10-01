import * as assert from 'assert';
import { resolveVisibleFromWindowState } from '../extension';

suite('BotX VS Code-active-only visibility', () => {
    test('focused VS Code window → robot visible', () => {
        assert.strictEqual(resolveVisibleFromWindowState({ focused: true } as any), true);
    });

    test('unfocused VS Code window (Chrome/Explorer/minimized) → robot hidden', () => {
        assert.strictEqual(resolveVisibleFromWindowState({ focused: false } as any), false);
    });

    test('unknown window state → visible (never stuck hidden after connect)', () => {
        assert.strictEqual(resolveVisibleFromWindowState(undefined), true);
    });
});
