import { Logger } from './logger';

/**
 * Runs one extension startup step (sensor start, server start, ...) without
 * letting a single optional-service failure abort the whole activation.
 *
 * A throwing sensor must never prevent `startRobotServer` (or the remaining
 * sensors) from running — otherwise the companion stays RECONNECTING forever
 * with no visible error. Failures are logged with the step name so the real
 * cause is diagnosable from the BotX output channel.
 *
 * @returns true when the step ran cleanly, false when it threw.
 */
export function safeStartupStep(stepName: string, fn: () => void): boolean {
    try {
        fn();
        return true;
    } catch (err) {
        Logger.info('STARTUP', {
            Event: 'Startup step failed — continuing activation',
            Step: stepName,
            Error: String(err),
        });
        return false;
    }
}
