/** Counts commits reachable from `head` that are not reachable from `base`. */
export declare const countCommitsBetweenRefs: ({ base, head, }: {
    base: string;
    head: string;
}) => Promise<number>;
