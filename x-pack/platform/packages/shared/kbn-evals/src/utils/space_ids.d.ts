/**
 * Reads the comma-separated spaces a run assigns its datasets and scores to.
 * Undefined means the target Kibana's default space.
 *
 * The first space listed is the one the run works in, so it decides the ids the
 * datasets take.
 *
 * Called both where `--space-ids` is read, so a typo fails before the stack
 * boots, and where the run picks the value back up.
 */
export declare const parseSpaceIds: (value: string | undefined) => string[] | undefined;
/** The spaces the run was started with, as {@link parseSpaceIds} read them. */
export declare const getSpaceIdsFromEnv: () => string[] | undefined;
