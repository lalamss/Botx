import * as assert from 'assert';
import { EventFilter } from '../eventFilter/eventFilter';
import { EventType } from '../eventFilter/eventTypes';

suite('EventFilter', () => {
    test('filters duplicate events within window', () => {
        const filter = new EventFilter();
        let count = 0;
        filter.subscribe(() => count++);
        const payload = { File: 'a.ts', Message: 'err' };
        filter.publish({ id: '1', type: EventType.DIAGNOSTICS_UPDATED, source: 'Test', timestamp: Date.now(), payload } as any);
        filter.publish({ id: '2', type: EventType.DIAGNOSTICS_UPDATED, source: 'Test', timestamp: Date.now(), payload } as any);
        // second should be deduplicated
        assert.strictEqual(count, 1);
    });

    test('allows different payloads', () => {
        const filter = new EventFilter();
        let count = 0;
        filter.subscribe(() => count++);
        filter.publish({ id: '1', type: EventType.DIAGNOSTICS_UPDATED, source: 'Test', timestamp: Date.now(), payload: { File: 'a.ts' } } as any);
        filter.publish({ id: '2', type: EventType.DIAGNOSTICS_UPDATED, source: 'Test', timestamp: Date.now(), payload: { File: 'b.ts' } } as any);
        assert.strictEqual(count, 2);
    });

    test('unsubscribe works', () => {
        const filter = new EventFilter();
        let count = 0;
        const cb = () => count++;
        filter.subscribe(cb);
        filter.unsubscribe(cb);
        filter.publish({ id: '1', type: EventType.EDITOR_ACTIVE, source: 'Test', timestamp: Date.now(), payload: {} } as any);
        assert.strictEqual(count, 0);
    });
});
