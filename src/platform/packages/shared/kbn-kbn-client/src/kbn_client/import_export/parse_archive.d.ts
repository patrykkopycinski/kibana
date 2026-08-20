export interface SavedObject {
    id: string;
    type: string;
    [key: string]: unknown;
}
export declare function parseArchive(path: string, { stripSummary }?: {
    stripSummary?: boolean;
}): Promise<SavedObject[]>;
