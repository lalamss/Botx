import * as assert from 'assert';
import { MotionPlanner } from '../motion/motionPlanner';
import { ExplanationType } from '../explanation/explanationTypes';
import { BehaviourAction } from '../behaviour/behaviourAction';
import type { Explanation } from '../explanation/explanationTypes';

function makeExplanation(type: ExplanationType, text = 'hello'): Explanation {
    return {
        id: 'exp-1',
        type,
        action: BehaviourAction.SHOW_ERROR_HELP,
        shortText: text,
        longText: text,
        confidence: 0.9,
        timestamp: Date.now(),
        expression: 'HELPFUL',
        fixes: [],
        fixCount: 0
    };
}

suite('MotionPlanner', () => {
    test('processFromExplanation publishes plan', () => {
        const planner = new MotionPlanner();
        let plan: any = null;
        planner.getPublisher().subscribe((p) => plan = p);
        planner.processFromExplanation(makeExplanation(ExplanationType.WHY_ERROR_HELP, 'fix this'));
        assert.ok(plan);
        assert.ok(Array.isArray(plan.motions));
        assert.ok(plan.motions.length >= 2);
    });

    test('processSilentThinking publishes thinking plan', () => {
        const planner = new MotionPlanner();
        let plan: any = null;
        planner.getPublisher().subscribe((p) => plan = p);
        planner.processSilentThinking();
        assert.ok(plan);
        assert.ok(plan.motions.some((m: any) => m.type === 'CHANGE_EXPRESSION'));
    });

    test('processFromEvent with SHOW_ERROR_HELP', () => {
        const planner = new MotionPlanner();
        let plan: any = null;
        planner.getPublisher().subscribe((p) => plan = p);
        planner.processFromEvent({ action: BehaviourAction.SHOW_ERROR_HELP, state: 'SPEAKING' as any, timestamp: Date.now(), data: {} });
        assert.ok(plan);
    });

    test('WHY_NONE returns no plan', () => {
        const planner = new MotionPlanner();
        let published = false;
        planner.getPublisher().subscribe(() => published = true);
        // WHY_NONE should return undefined internally, but processFromExplanation will not publish
        planner.processFromExplanation(makeExplanation(ExplanationType.WHY_NONE, ''));
        // publish may still happen? Actually WHY_NONE priority 0 => no plan => no publish
        // our first publish is consumed, need to check second call doesn't add extra
        let count = 0;
        const p2 = new MotionPlanner();
        p2.getPublisher().subscribe(() => count++);
        p2.processFromExplanation({ id: 'x', type: ExplanationType.WHY_NONE, action: BehaviourAction.NONE, shortText: '', longText: '', confidence: 0, timestamp: Date.now() });
        assert.strictEqual(count, 0);
    });

    test('priority ordering and queue', () => {
        const planner = new MotionPlanner();
        let plans: any[] = [];
        planner.getPublisher().subscribe((p) => plans.push(p));
        planner.processFromExplanation(makeExplanation(ExplanationType.WHY_ERROR_HELP, 'high priority'));
        planner.processFromExplanation(makeExplanation(ExplanationType.WHY_CELEBRATE, 'low priority'));
        assert.ok(plans.length >= 2);
    });

    test('calculateEditorAnchor returns payload', () => {
        const planner = new MotionPlanner();
        const fakeEditor = {
            visibleRanges: [{ start: { line: 0 }, end: { line: 20 } }],
            selection: { active: { line: 5, character: 10 } },
            document: { uri: { fsPath: 'a.ts' } }
        } as any;
        // mock workspace config
        const anchor = planner.calculateEditorAnchor(fakeEditor, 5);
        assert.ok(typeof anchor.targetX === 'number');
        assert.ok(typeof anchor.targetY === 'number');
        assert.ok(['left-editor', 'right-editor', 'bottom-panel', 'floating'].includes(anchor.alignment));
    });
});
