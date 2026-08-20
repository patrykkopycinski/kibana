export declare const getAllFtrConfigsAndManifests: () => {
    ftrConfigEntries: Map<string, string[]>;
    manifestPaths: {
        stateful: string[];
        serverless: string[];
        all: string[];
    };
};
