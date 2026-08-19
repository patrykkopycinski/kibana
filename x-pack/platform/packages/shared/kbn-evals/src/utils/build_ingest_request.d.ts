import type { Model as InferenceModel } from '@kbn/inference-common';
import type { IngestScoresRequestBodyInput } from '@kbn/evals-common';
import type { SomeDevLog } from '@kbn/some-dev-log';
import type { BuildkiteCiMetadata } from './ci_metadata';
import type { GitMetadata } from './git_metadata';
import type { EvaluationCompleteEvent, DatasetRunResult } from '../types';
type BuildIngestRequestSource = {
    kind: 'event';
    event: EvaluationCompleteEvent;
} | {
    kind: 'experiments';
    experiments: DatasetRunResult[];
};
interface BuildIngestRequestArgs {
    taskModel: InferenceModel;
    evaluatorModel: InferenceModel;
    repetitions: number;
    hostName: string;
    gitMetadata: GitMetadata;
    suiteId?: string;
    executionId?: string;
    buildkiteMetadata?: BuildkiteCiMetadata;
    spaceIds?: string[];
    log?: Pick<SomeDevLog, 'warning'>;
    source: BuildIngestRequestSource;
}
export declare function buildIngestRequest({ taskModel, evaluatorModel, repetitions, hostName, gitMetadata, suiteId, executionId, buildkiteMetadata, spaceIds, log, source, }: BuildIngestRequestArgs): IngestScoresRequestBodyInput[];
export {};
