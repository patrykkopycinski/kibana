/** Container for metadata that can be attached to different ci-stats objects */
export interface CiStatsMetadata {
    /**
     * Arbitrary key-value pairs which can be attached to CiStatsTiming and CiStatsMetric
     * objects stored in the ci-stats service
     */
    [key: string]: string | string[] | number | boolean | undefined;
}
