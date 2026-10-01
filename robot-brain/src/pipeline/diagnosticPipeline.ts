import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { Debounce } from '../eventFilter/debounce';
import { PerceptionEngine } from '../perception';
import { ContextEngine } from '../context/contextEngine';
import { DecisionEngine } from '../decision';
import { BehaviourController } from '../behaviour';
import { MotionPlanner } from '../motion';
import { AIExplanationEngine } from '../explanation';
import { CodeFixRegistry } from '../ui/botxCodeActionProvider';
import { diagnosticSeverityToString } from '../utils/codeAnalysis';
import type { Observation } from '../perception/observation';
import type { DiagnosticAnalysisRequest, DiagnosticError } from '../explanation/explanationTypes';

const DIAGNOSTIC_ANALYSIS_DEBOUNCE_MS = 1500;

function diagnosticSeverityToObservationType(severity: vscode.DiagnosticSeverity): import('../perception').DiagnosticObservation["type"] {
    switch (severity) {
        case vscode.DiagnosticSeverity.Error: return "SYNTAX_ERROR";
        case vscode.DiagnosticSeverity.Warning: return "WARNING";
        default: return "INFO";
    }
}

export interface DiagnosticPipelineDeps {
    perception: PerceptionEngine;
    contextEngine: ContextEngine;
    decisionEngine: DecisionEngine;
    behaviour: BehaviourController;
    planner: MotionPlanner;
    explainer: AIExplanationEngine;
    fixRegistry: CodeFixRegistry;
    context: vscode.ExtensionContext;
}

export class DiagnosticPipeline {
    private diagnosticAnalysisInFlight = false;
    private pendingDiagnosticObs: Observation | null = null;
    private debouncer: Debounce;

    constructor(
        private readonly deps: DiagnosticPipelineDeps,
        debouncer?: Debounce
    ) {
        this.debouncer = debouncer ?? new Debounce();
    }

    scheduleDiagnosticAnalysis(): void {
        this.debouncer.debounce(
            'diagnostics',
            () => { void this.triggerDiagnosticAnalysis(); },
            DIAGNOSTIC_ANALYSIS_DEBOUNCE_MS
        );
    }

    clear(): void {
        this.debouncer.clear('diagnostics');
    }

    dispose(): void {
        this.clear();
    }

    private async runDiagnosticAnalysis(obs: Observation): Promise<void> {
        if (this.diagnosticAnalysisInFlight) {
            this.pendingDiagnosticObs = obs;
            return;
        }
        this.diagnosticAnalysisInFlight = true;
        try {
            await this.runDiagnosticAnalysisInternal(obs);
        } finally {
            this.diagnosticAnalysisInFlight = false;
            if (this.pendingDiagnosticObs) {
                const next = this.pendingDiagnosticObs;
                this.pendingDiagnosticObs = null;
                void this.runDiagnosticAnalysis(next);
            }
        }
    }

    private async runDiagnosticAnalysisInternal(obs: Observation): Promise<void> {
        const { perception, decisionEngine, behaviour, contextEngine, explainer, fixRegistry } = this.deps;
        const data = obs.data;
        const file = String(data["File"] ?? "");
        const fileName = file.split(/[\\/]/).pop() || file;
        const errors = (Array.isArray(data["errors"]) ? data["errors"] : []) as Record<string, unknown>[];
        const errorCount = errors.length;
        const broadcastSignature = String(data["diagnosticBatchSignature"] ?? "");

        if (errorCount === 0) {
            behaviour.forceIdle();
            fixRegistry.clear();
            return;
        }

        // Re-entrancy guard already handled outer; still set inner flag for legacy logic
        this.diagnosticAnalysisInFlight = true;
        try {
            if (perception.shouldBroadcastDiagnostic(file, broadcastSignature) &&
                decisionEngine.shouldNotifyDiagnostic(file, broadcastSignature)) {
                perception.recordDiagnosticNotification(file, broadcastSignature);
                decisionEngine.recordDiagnosticNotification(file, broadcastSignature);
                behaviour.broadcastRobotStateUpdate(
                    "THINKING",
                    `Analyzing ${errorCount} error${errorCount === 1 ? "" : "s"} in ${fileName}...`,
                    errorCount
                );
            }

            const ctx = await contextEngine.buildDiagnosticContext(obs);

            const request: DiagnosticAnalysisRequest = {
                file: String(ctx.data["file"] ?? ""),
                fileName: String(ctx.data["fileName"] ?? ""),
                language: String(ctx.data["language"] ?? ""),
                fileContent: String(ctx.data["fileContent"] ?? ""),
                surroundingCode: (ctx.data["surroundingCode"] as Record<number, string>) ?? {},
                errors: (ctx.data["errors"] as DiagnosticError[] | undefined) ?? [],
                warnings: (ctx.data["warnings"] as DiagnosticError[] | undefined) ?? [],
                errorCount: Number(ctx.data["errorCount"] ?? 0),
                warningCount: Number(ctx.data["warningCount"] ?? 0),
                resolvedDependencies: String(ctx.data["resolvedDependenciesText"] ?? "")
            };

            const explanation = await explainer.analyzeDiagnostics(request);

            fixRegistry.setFixes(file, explanation.fixes ?? []);

            if (perception.shouldBroadcastDiagnostic(file, broadcastSignature) &&
                decisionEngine.shouldNotifyDiagnostic(file, broadcastSignature)) {
                perception.recordDiagnosticNotification(file, broadcastSignature);
                decisionEngine.recordDiagnosticNotification(file, broadcastSignature);
                behaviour.broadcastRobotStateUpdate(
                    explanation.expression ?? "CONFUSED",
                    explanation.shortText,
                    explanation.fixCount ?? explanation.fixes?.length ?? 0
                );
            } else {
                behaviour.enterThinkingSilently();
            }
        } catch (err) {
            Logger.info("PIPELINE", { "Event": "Diagnostic analysis failed", "Error": String(err) });
            if (perception.shouldBroadcastDiagnostic(file, broadcastSignature) &&
                decisionEngine.shouldNotifyDiagnostic(file, broadcastSignature)) {
                perception.recordDiagnosticNotification(file, broadcastSignature);
                decisionEngine.recordDiagnosticNotification(file, broadcastSignature);
                behaviour.broadcastRobotStateUpdate("CONFUSED", "I got confused analyzing that — let me try again.", errorCount);
            } else {
                behaviour.enterThinkingSilently();
            }
        } finally {
            // outer finally will clear flag; keep for symmetry
            this.diagnosticAnalysisInFlight = false;
        }
    }

    async triggerDiagnosticAnalysis(): Promise<void> {
        const { perception, behaviour, fixRegistry } = this.deps;
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.scheme !== "file") {
            return;
        }

        const document = editor.document;
        const uri = document.uri;
        const file = document.fileName;
        const language = document.languageId;
        const diagnostics = vscode.languages.getDiagnostics(uri);

        if (!perception.shouldAnalyzeDocument(document, diagnostics)) {
            behaviour.forceIdle();
            fixRegistry.clear();
            return;
        }

        const errorCount = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length;
        if (errorCount === 0) {
            behaviour.forceIdle();
            fixRegistry.clear();
            return;
        }

        const diagnosticSignature = perception.computeDiagnosticBatchSignature(uri.toString(), diagnostics);
        if (!perception.shouldBroadcastDiagnostic(file, diagnosticSignature)) {
            behaviour.enterThinkingSilently();
            return;
        }
        perception.recordDiagnosticNotification(file, diagnosticSignature);

        const obs = perception.processDiagnosticBatch(
            diagnostics.map((d) => ({
                type: diagnosticSeverityToObservationType(d.severity),
                details: d.message,
                line: d.range.start.line + 1,
                column: d.range.start.character + 1,
                file,
                language,
                severity: diagnosticSeverityToString(d.severity),
                code: d.code ? String(d.code) : undefined
            })),
            { file, language }
        );

        if (!obs) {
            return;
        }

        await this.runDiagnosticAnalysis(obs);
    }

    wireSubscriptions(): void {
        const { perception, decisionEngine, behaviour } = this.deps;
        this.deps.context.subscriptions.push(
            vscode.languages.onDidChangeDiagnostics(() => {
                behaviour.enterThinkingSilently();
                this.scheduleDiagnosticAnalysis();
            }),
            vscode.window.onDidChangeActiveTextEditor(() => {
                if (!vscode.window.activeTextEditor) {
                    this.clear();
                    behaviour.forceIdle();
                    return;
                }
                perception.resetDiagnosticNotifyGate();
                decisionEngine.resetDiagnosticNotifyGate();
                this.scheduleDiagnosticAnalysis();
            }),
            vscode.workspace.onDidChangeTextDocument(() => {
                this.scheduleDiagnosticAnalysis();
            }),
            vscode.workspace.onDidSaveTextDocument(() => {
                this.scheduleDiagnosticAnalysis();
            }),
            vscode.workspace.onDidCloseTextDocument(() => {
                this.clear();
            })
        );
    }
}
