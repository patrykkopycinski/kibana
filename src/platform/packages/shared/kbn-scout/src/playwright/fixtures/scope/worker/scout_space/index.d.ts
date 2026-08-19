import type { UiSettingValues } from '@kbn/kbn-client';
/**
 * Solution view types for Kibana spaces.
 * Should match: 'oblt' | 'security' | 'es' | 'classic'
 * (excludes 'workplaceai' from the full SolutionView type)
 */
export type SpaceSolutionView = 'oblt' | 'security' | 'es' | 'classic';
export interface ImportSavedObjects {
    type: string;
    destinationId: string;
    meta: {
        title: string;
    };
}
export interface ImportExportResponse {
    successResults: ImportSavedObjects[];
}
export interface SavedObjectResponse {
    id: string;
    type: string;
    title: string;
}
export interface ScoutSpaceParallelFixture {
    id: string;
    savedObjects: {
        load: (path: string) => Promise<SavedObjectResponse[]>;
        cleanStandardList: () => Promise<void>;
    };
    uiSettings: {
        setDefaultIndex: (dataViewName: string) => Promise<void>;
        set: (values: UiSettingValues) => Promise<void>;
        unset: (...keys: string[]) => Promise<any[]>;
        setDefaultTime: ({ from, to }: {
            from: string;
            to: string;
        }) => Promise<void>;
    };
    /**
     * Sets the solution view for this space.
     * @param solution - The solution to set ('es', 'oblt', 'security', or 'classic')
     */
    setSolutionView: (solution: SpaceSolutionView) => Promise<void>;
}
export { scoutSpaceParallelFixture } from './parallel';
