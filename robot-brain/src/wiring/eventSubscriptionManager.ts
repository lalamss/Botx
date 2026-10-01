import * as vscode from 'vscode';
import { EventFilter } from '../eventFilter/eventFilter';
import { EventType } from '../eventFilter/eventTypes';
import { BehaviourController } from '../behaviour';
import { PerceptionEngine } from '../perception';
import { MotionPlanner } from '../motion';
import { Debounce } from '../eventFilter/debounce';
import type { EnvironmentStatus } from '../sensors/environmentSensor';
import type { DeprecatedApiUsage } from '../sensors/importInspector';
import { EnvironmentSensor } from '../sensors/environmentSensor';
import { GitConflictSensor } from '../sensors/gitConflictSensor';
import { ImportInspector } from '../sensors/importInspector';

export interface WiringDeps {
    eventFilter: EventFilter;
    perception: PerceptionEngine;
    behaviour: BehaviourController;
    planner: MotionPlanner;
    environmentSensor?: EnvironmentSensor | null;
    gitConflictSensor: GitConflictSensor;
    importInspector: ImportInspector;
    apiMigrationDebouncer: Debounce;
    context: vscode.ExtensionContext;
}

const DEPRECATED_API_SPEECH_DEBOUNCE_MS = 1200;

export class EventSubscriptionManager {
    constructor(private readonly deps: WiringDeps) {}

    wireAll(): void {
        this.wireEnvironment();
        this.wireGitConflict();
        this.wireDeprecatedApi();
        this.wireSensorToPerception();
        this.wireEditorChanges();
        this.wirePhase1Thinking();
    }

    private wireEnvironment(): void {
        const { eventFilter, behaviour } = this.deps;
        eventFilter.subscribe((event) => {
            if (event.type !== EventType.ENVIRONMENT_CHECK) return;
            const status = event.payload as EnvironmentStatus;
            behaviour.onEnvironmentStatus(status);
        });
    }

    private wireGitConflict(): void {
        const { eventFilter, behaviour } = this.deps;
        eventFilter.subscribe((event) => {
            if (event.type !== EventType.GIT_CONFLICT_DETECTED && event.type !== EventType.GIT_CONFLICT_RESOLVED) return;
            const payload = event.payload as Record<string, unknown> | undefined;
            const fileName = String(payload?.["FileName"] ?? payload?.["File"] ?? payload?.["Repository"] ?? "this file");
            if (event.type === EventType.GIT_CONFLICT_DETECTED) {
                const count = Number(payload?.["ConflictCount"] ?? payload?.["Conflict Count"] ?? 0) || 0;
                behaviour.onGitConflictDetected(count, fileName);
            } else {
                behaviour.onGitConflictResolved(fileName);
            }
        });
    }

    private wireDeprecatedApi(): void {
        const { eventFilter, behaviour, apiMigrationDebouncer } = this.deps;
        eventFilter.subscribe((event) => {
            if (event.type !== EventType.DEPRECATED_API_DETECTED) return;
            const payload = event.payload as Record<string, unknown> | undefined;
            const deprecations = Array.isArray(payload?.["Deprecations"]) ? payload["Deprecations"] as DeprecatedApiUsage[] : [];
            const count = deprecations.length;
            if (count === 0) {
                apiMigrationDebouncer.clear('deprecated-api');
                behaviour.forceIdle();
                return;
            }
            behaviour.onDeprecatedApiDetected(deprecations);
            const primary = deprecations[0];
            apiMigrationDebouncer.debounce('deprecated-api', () => {
                behaviour.broadcastRobotStateUpdate(
                    "worried",
                    `Deprecated SDK API on Line ${primary.line}: ${primary.description}`,
                    count
                );
            }, DEPRECATED_API_SPEECH_DEBOUNCE_MS);
        });
    }

    private wireSensorToPerception(): void {
        const { eventFilter, perception } = this.deps;
        eventFilter.subscribe((event) => perception.process(event));
    }

    private wireEditorChanges(): void {
        const { eventFilter } = this.deps;
        // Notify companion on editor changes
        eventFilter.subscribe((event) => {
            if (event.type === EventType.EDITOR_ACTIVE || event.type === EventType.EDITOR_SWITCHED) {
                // sendToRobot will be handled by diagnostic pipeline wiring or separate subscription in extension
                // Keep lightweight here — actual send is done via extension's direct subscription to avoid circular deps
            }
        });
    }

    private wirePhase1Thinking(): void {
        const { eventFilter, behaviour, planner } = this.deps;
        eventFilter.subscribe((event) => {
            if (event.type !== EventType.DIAGNOSTICS_UPDATED) return;
            const payload = event.payload as Record<string, unknown> | undefined;
            const severity = String(payload?.["Severity"] ?? "");
            if (severity === "Error") {
                behaviour.enterThinkingSilently();
                planner.processSilentThinking();
            } else {
                behaviour.forceIdle();
            }
        });
    }
}
