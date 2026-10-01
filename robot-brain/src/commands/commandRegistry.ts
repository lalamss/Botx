import * as vscode from 'vscode';
import { SecretManager } from '../utils/secretManager';
import { sendToRobot } from '../utils/websocketServer';
import { setupWorkspaceEnv } from '../utils/envSetup';

export interface CommandRegistryDeps {
    secretManager: SecretManager;
    setupWorkspaceEnvFn?: () => Promise<boolean>;
    resolveGitConflict: (uri: vscode.Uri, blockStartLine: number) => Promise<void>;
    migrateApiCall: (uri: vscode.Uri, line: number) => Promise<void>;
    applyBotXFix: (uri: vscode.Uri, line: number, suggestedCode: string, description: string) => Promise<void>;
}

export function registerBotXCommands(
    context: vscode.ExtensionContext,
    deps: CommandRegistryDeps
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('botx.explainError', () => {
            vscode.window.showInformationMessage('BotX: Analyzing error...');
        }),
        vscode.commands.registerCommand('botx.showRobot', () => {
            sendToRobot({ type: 'WINDOW_VISIBILITY', visible: true });
        }),
        vscode.commands.registerCommand('botx.hideRobot', () => {
            sendToRobot({ type: 'WINDOW_VISIBILITY', visible: false });
        }),
        vscode.commands.registerCommand('botx.setApiKey', async () => {
            const key = await vscode.window.showInputBox({
                prompt: 'Enter your Gemini API Key (Get a free key at https://aistudio.google.com)',
                password: true,
                placeHolder: 'GEMINI_API_KEY'
            });
            if (key) {
                await deps.secretManager.setGeminiApiKey(key);
                vscode.window.showInformationMessage('BotX: API key saved securely.');
            }
        }),
        vscode.commands.registerCommand('botx.setupWorkspaceEnv', () => {
            const fn = deps.setupWorkspaceEnvFn ?? setupWorkspaceEnv;
            void fn();
        }),
        vscode.commands.registerCommand(
            'botx.resolveGitConflict',
            async (uri: vscode.Uri, blockStartLine: number) => {
                try {
                    await deps.resolveGitConflict(uri, blockStartLine);
                } catch (err) {
                    vscode.window.showErrorMessage(`BotX: Failed to resolve conflict: ${String(err)}`);
                }
            }
        ),
        vscode.commands.registerCommand(
            'botx.migrateApiCall',
            async (uri: vscode.Uri, line: number) => {
                try {
                    await deps.migrateApiCall(uri, line);
                } catch (err) {
                    vscode.window.showErrorMessage(`BotX: Migration failed: ${String(err)}`);
                }
            }
        ),
        vscode.commands.registerCommand(
            'botx.applyAiFix',
            async (
                uri: vscode.Uri,
                line: number,
                suggestedCode: string,
                description: string
            ) => {
                try {
                    await deps.applyBotXFix(uri, line, suggestedCode, description);
                } catch (err) {
                    vscode.window.showErrorMessage(`BotX: Fix failed: ${String(err)}`);
                }
            }
        )
    );
}
