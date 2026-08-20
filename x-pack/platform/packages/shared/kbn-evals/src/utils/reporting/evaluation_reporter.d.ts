import type { SomeDevLog } from '@kbn/some-dev-log';
import type { EvalsClient } from '../evals_client';
import type { ReportDisplayOptions } from '../../types';
export type EvaluationReporter = (evalsClient: EvalsClient, experimentId: string, log: SomeDevLog, options?: {
    taskModelId?: string;
    suiteId?: string;
    executionId?: string;
}) => Promise<void>;
export declare function createDefaultTerminalReporter(options?: {
    reportDisplayOptions?: ReportDisplayOptions;
}): EvaluationReporter;
