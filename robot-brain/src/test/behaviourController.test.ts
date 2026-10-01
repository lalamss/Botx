import * as assert from 'assert';
import { BehaviourController } from '../behaviour/behaviourController';
import { MotionPlanner } from '../motion/motionPlanner';
import { DecisionType } from '../decision/decisionType';
import { ContextType } from '../context/contextType';
import type { Decision } from '../decision/decision';
import { BehaviourAction } from '../behaviour/behaviourAction';

function makeDecision(type: DecisionType): Decision {
    return {
        id: 'dec-1',
        type,
        confidence: 0.9,
        timestamp: Date.now(),
        reason: 'test',
        sourceContext: { id: 'ctx-1', type: ContextType.FIXING_COMPILER_ERROR, confidence: 0.9, timestamp: Date.now(), sourceObservation: {} as any, data: {} },
        data: {}
    };
}

suite('BehaviourController', () => {
    test('process SHOW_ERROR_HELP publishes event', () => {
        const planner = new MotionPlanner();
        const ctrl = new BehaviourController(planner);
        let event: any = null;
        ctrl.getPublisher().subscribe((e) => event = e);
        ctrl.process(makeDecision(DecisionType.SHOW_ERROR_HELP));
        assert.ok(event);
        assert.strictEqual(event.action, BehaviourAction.SHOW_ERROR_HELP);
    });

    test('DO_NOTHING yields no event', () => {
        const ctrl = new BehaviourController();
        let published = false;
        ctrl.getPublisher().subscribe(() => published = true);
        ctrl.process(makeDecision(DecisionType.DO_NOTHING));
        assert.strictEqual(published, false);
    });

    test('enterThinkingSilently transitions to THINKING', () => {
        const ctrl = new BehaviourController();
        ctrl.enable();
        ctrl.enterThinkingSilently();
        const state = ctrl.getState();
        assert.ok(state.currentState === 'THINKING' || String(state.currentState).includes('THINKING'));
    });

    test('forceIdle resets to IDLE', () => {
        const ctrl = new BehaviourController();
        ctrl.enable();
        ctrl.enterThinkingSilently();
        ctrl.forceIdle();
        assert.strictEqual(ctrl.getState().currentState, 'IDLE' as any);
    });

    test('onGitConflictDetected broadcasts', () => {
        const ctrl = new BehaviourController();
        ctrl.enable();
        // should not throw
        ctrl.onGitConflictDetected(2, 'file.ts');
        assert.ok(ctrl.getState().currentState === 'PROACTIVE_ASSIST' as any || ctrl.getState().currentState === 'PROACTIVE_ASSIST' as any);
    });

    test('onDeprecatedApiDetected sets THINKING', () => {
        const ctrl = new BehaviourController();
        ctrl.enable();
        ctrl.forceIdle();
        ctrl.onDeprecatedApiDetected([{ line: 5, symbol: 'oldFunc', packageName: 'pkg', description: 'deprecated', installedVersion: '1.0', targetVersion: '2.0' } as any]);
        assert.ok(ctrl.getState().currentState === 'THINKING' as any);
    });

    test('disable prevents processing', () => {
        const ctrl = new BehaviourController();
        ctrl.disable();
        let published = false;
        ctrl.getPublisher().subscribe(() => published = true);
        ctrl.process(makeDecision(DecisionType.SHOW_ERROR_HELP));
        assert.strictEqual(published, false);
    });
});
