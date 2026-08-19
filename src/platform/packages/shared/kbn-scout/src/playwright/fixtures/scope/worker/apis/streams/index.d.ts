import type { KbnClient, ScoutLogger } from '../../../../../../common';
import type { ScoutSpaceParallelFixture } from '../../scout_space';
import { type Condition, type IngestUpsertRequest, type RoutingStatus, type StreamlangDSL, type StreamsIngestGetResponse } from './types';
export interface StreamsApiService {
    enable: () => Promise<void>;
    disable: () => Promise<void>;
    forkStream: (streamName: string, destination: string, condition: Condition, status?: RoutingStatus) => Promise<void>;
    /** See `./types` JSDoc for casting to `@kbn/streams-schema` definition types in tests. */
    getStreamDefinition: (streamName: string) => Promise<StreamsIngestGetResponse>;
    /** Materialize backing data stream for deferred wired roots (e.g. `logs.otel`). */
    restoreDataStream: (streamName: string) => Promise<void>;
    deleteStream: (streamName: string) => Promise<void>;
    /** Update a stream's ingest settings and/or description. */
    updateStream: (streamName: string, updateBody: {
        ingest: IngestUpsertRequest;
        description?: string;
    } | {
        ingest?: IngestUpsertRequest;
        description: string;
    }) => Promise<void>;
    clearStreamChildren: (streamName: string) => Promise<void>;
    clearStreamMappings: (streamName: string) => Promise<void>;
    clearStreamProcessors: (streamName: string) => Promise<void>;
    updateStreamProcessors: (streamName: string, getProcessors: StreamlangDSL | ((prevProcessors: StreamlangDSL) => StreamlangDSL)) => Promise<void>;
}
export declare const getStreamsApiService: ({ kbnClient, log, scoutSpace, }: {
    kbnClient: KbnClient;
    log: ScoutLogger;
    scoutSpace?: ScoutSpaceParallelFixture;
}) => StreamsApiService;
