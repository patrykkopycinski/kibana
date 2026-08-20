import type { SpaceSolutionView } from '../../scout_space';
import type { KbnClient, ScoutLogger } from '../../../../../../common';
export interface SpacesApiService {
    create: (space: {
        id: string;
        name?: string;
        disabledFeatures?: string[];
        /** Cross-project search default NPRE for the space (serverless CPS). */
        projectRouting?: string;
    }) => Promise<void>;
    get: (id: string) => Promise<{
        id: string;
        name: string;
        projectRouting?: string;
    }>;
    delete: (id: string) => Promise<void>;
    setSolutionView: (params: {
        id: string;
        solution: SpaceSolutionView;
    }) => Promise<void>;
    resetViewToClassic: (id: string) => Promise<void>;
}
export declare const getSpacesApiHelper: (log: ScoutLogger, kbnClient: KbnClient) => SpacesApiService;
