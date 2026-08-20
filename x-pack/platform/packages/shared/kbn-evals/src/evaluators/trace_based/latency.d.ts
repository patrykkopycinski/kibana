import type { Client as EsClient } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import type { Evaluator } from '../../types';
export declare function createLatencyEvaluator({ traceEsClient, log, }: {
    traceEsClient: EsClient;
    log: ToolingLog;
}): Evaluator;
type SpanLatencyFilter = {
    spanName: string;
    operationName?: undefined;
} | {
    operationName: string;
    spanName?: undefined;
};
export declare function createSpanLatencyEvaluator({ traceEsClient, log, spanName, operationName, }: {
    traceEsClient: EsClient;
    log: ToolingLog;
} & SpanLatencyFilter): Evaluator;
export {};
