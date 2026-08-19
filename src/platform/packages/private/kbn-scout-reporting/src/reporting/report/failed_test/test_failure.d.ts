export interface TestFailure {
    id: string;
    suite: string;
    title: string;
    target: string;
    command: string;
    location: string;
    owner: string[];
    kibanaModule?: {
        id: string;
        type: string;
        visibility: string;
        group: string;
    };
    duration: number;
    error: {
        message?: string;
        stack_trace?: string;
    };
    stdout?: string;
    consoleErrors?: string;
    attachments: Array<{
        name: string;
        path?: string;
        contentType: string;
    }>;
    /** Zero-based attempt index; 0 is the first run, 1 the first retry. */
    attempt?: number;
}
