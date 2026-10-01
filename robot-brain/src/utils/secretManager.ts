import * as vscode from 'vscode';

export const GEMINI_API_KEY_SECRET = 'GEMINI_API_KEY';
export const GEMINI_API_KEY_ENV = 'GEMINI_API_KEY';

export class SecretManager {
    constructor(private readonly context: vscode.ExtensionContext) {}

    async getGeminiApiKey(): Promise<string | undefined> {
        const stored = await this.context.secrets.get(GEMINI_API_KEY_SECRET);
        if (stored) {
            return stored;
        }
        // Environment fallback is ONLY allowed in explicit test/CI mode.
        // Set BOTX_ALLOW_ENV_API_KEY=true to enable it. Prevents accidental
        // plaintext exposure in production.
        if (process.env.BOTX_ALLOW_ENV_API_KEY === 'true') {
            return process.env[GEMINI_API_KEY_ENV];
        }
        return undefined;
    }

    async setGeminiApiKey(key: string): Promise<void> {
        await this.context.secrets.store(GEMINI_API_KEY_SECRET, key.trim());
    }

    async clearGeminiApiKey(): Promise<void> {
        await this.context.secrets.delete(GEMINI_API_KEY_SECRET);
    }
}
