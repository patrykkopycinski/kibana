export interface NearestMergeBaseCandidate {
    baseRef: string;
    mergeBase: string;
    aheadCount: number;
}
/**
 * Resolves the closest merge-base candidate between `headRef` and the provided base refs.
 * "Closest" is the candidate with the smallest ahead count from the merge base to head.
 */
export declare const resolveNearestMergeBase: ({ baseRefs, headRef, }: {
    baseRefs: string[];
    headRef?: string;
}) => Promise<NearestMergeBaseCandidate | undefined>;
