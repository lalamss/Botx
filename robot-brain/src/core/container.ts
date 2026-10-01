import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { SecretManager } from '../utils/secretManager';
import { PerceptionEngine } from '../perception';
import { ContextEngine } from '../context/contextEngine';
import { DecisionEngine } from '../decision';
import { BehaviourController } from '../behaviour';
import { MotionPlanner } from '../motion';
import { AIExplanationEngine } from '../explanation';

export interface BotXServices {
    vscode: typeof vscode;
    logger: typeof Logger;
    secretManager: SecretManager;
    perception: PerceptionEngine;
    contextEngine: ContextEngine;
    decisionEngine: DecisionEngine;
    behaviourController: BehaviourController;
    motionPlanner: MotionPlanner;
    explanationEngine: AIExplanationEngine;
}

export function createBotXContainer(context: vscode.ExtensionContext): BotXServices {
    const secretManager = new SecretManager(context);
    const perception = new PerceptionEngine();
    const contextEngine = new ContextEngine();
    const decisionEngine = new DecisionEngine();
    const motionPlanner = new MotionPlanner();
    const behaviour = new BehaviourController(motionPlanner);
    const explainer = new AIExplanationEngine();
    explainer.setApiKeyRetriever(() => secretManager.getGeminiApiKey());
    return {
        vscode,
        logger: Logger,
        secretManager,
        perception,
        contextEngine,
        decisionEngine,
        behaviourController: behaviour,
        motionPlanner,
        explanationEngine: explainer
    };
}
