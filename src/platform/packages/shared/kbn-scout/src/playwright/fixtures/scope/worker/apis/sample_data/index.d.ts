import type { KbnClient, ScoutLogger } from '../../../../../../common';
export interface SampleDataApiService {
    install: (dataSetId: string, spaceId?: string) => Promise<void>;
    remove: (dataSetId: string, spaceId?: string) => Promise<void>;
}
export declare const getSampleDataApiHelper: (log: ScoutLogger, kbnClient: KbnClient) => SampleDataApiService;
