import type { AetherEvent } from '../eventFilter/event';
import type { Observation } from '../perception/observation';
import type { Context } from '../context/context';
import type { Decision } from '../decision/decision';
import type { BehaviourEvent } from '../behaviour/behaviourPublisher';
import type { MotionPlan } from '../motion/motionPlan';

// Formal pipeline contracts – explicit and typed
export interface PerceptionStage {
    process(event: AetherEvent): void;
    processDiagnosticBatch?(diagnostics: unknown[], meta?: unknown): Observation | undefined;
}

export interface ContextStage {
    process(observation: Observation): void;
    buildDiagnosticContext?(obs: Observation): Promise<Context>;
}

export interface DecisionStage {
    process(context: Context): void;
}

export interface BehaviourStage {
    process(decision: Decision): void;
}

export interface MotionStage {
    processFromExplanation?(exp: import('../explanation/explanationTypes').Explanation): void;
    processFromEvent?(event: BehaviourEvent): void;
    enqueue(plan: MotionPlan): void;
}

export interface PipelineContracts {
    perception: PerceptionStage;
    context: ContextStage;
    decision: DecisionStage;
    behaviour: BehaviourStage;
    motion: MotionStage;
}

// Shared domain types for validation
export type SensorEventPayload = Record<string, unknown>;
export type RobotMessage = {
    type: string;
    payload?: Record<string, unknown>;
    [key: string]: unknown;
};

// Discriminated union for WebSocket incoming messages
export type IncomingWsMessage =
    | { type: 'CURSOR_MOVE'; relativeX: number; relativeY: number }
    | { type: 'USER_DISMISS' }
    | { type: 'EDITOR_CHANGED' }
    | { type: 'WINDOW_VISIBILITY'; visible: boolean };
