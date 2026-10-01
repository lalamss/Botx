import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { BehaviourController } from '../behaviour';
import { AIExplanationEngine } from '../explanation';
import { extractFunctionSnippet } from '../utils/codeAnalysis';
import type { Observation } from '../perception/observation';
import type { LogicReviewRequest } from '../explanation/explanationTypes';

export interface StuckDetectionDeps {
    behaviour: BehaviourController;
    explainer: AIExplanationEngine;
}

export class StuckDetectionPipeline {
    constructor(private readonly deps: StuckDetectionDeps) {}

    async handleStuckLogicReview(obs: Observation): Promise<void> {
        const { behaviour, explainer } = this.deps;
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.uri.scheme !== "file") {
                return;
            }

            const document = editor.document;
            const data = obs.data as Record<string, unknown> | undefined;
            const file = String(data?.["File"] ?? document.fileName);
            const line = Number(data?.["Line"] ?? editor.selection.active.line + 1);
            const fileContent = document.getText();
            const fnContext = extractFunctionSnippet(document, line);

            const request: LogicReviewRequest = {
                file,
                fileName: file.split(/[\\/]/).pop() || file,
                language: document.languageId,
                functionName: String(data?.["Function"] ?? fnContext.name),
                startLine: Number(data?.["Line"] ?? fnContext.startLine),
                fileContent,
                functionCode: String(data?.["FunctionCode"] ?? fnContext.snippet)
            };

            const explanation = await explainer.proactiveLogicReview(request);
            behaviour.broadcastRobotStateUpdate(
                explanation.expression ?? "ALERT",
                explanation.shortText,
                explanation.fixCount ?? 0
            );
        } catch (err) {
            Logger.info("STUCK_REVIEW", { Event: "Logic review failed", Error: String(err) });
            this.deps.behaviour.broadcastRobotStateUpdate("CONFUSED", "I'm having trouble reviewing that logic — try again shortly.", 0);
        }
    }
}
