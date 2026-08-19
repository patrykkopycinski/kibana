export declare const getTestTagsForTarget: (target: string) => string[];
export declare const collectUniqueTags: (tests: Array<{
    tags?: string[];
    expectedStatus?: string;
    location?: {
        file?: string;
    };
}>) => string[];
export declare const getServerRunFlagsFromTags: (testTags: string[]) => string[];
