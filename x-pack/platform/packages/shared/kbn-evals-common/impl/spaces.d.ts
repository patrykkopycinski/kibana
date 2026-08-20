/**
 * Restated rather than taken from the spaces plugin, which neither this package
 * nor its offline callers can depend on.
 */
export declare const DEFAULT_SPACE_ID = "default";
/**
 * The spaces wildcard. Evaluations data is never assigned to it: a dataset for
 * several spaces names each one. Kept so the wildcard can be recognised and
 * refused rather than stored as if it were a space id.
 */
export declare const ALL_SPACES_ID = "*";
/**
 * The space a dataset belongs to, which its id is derived from. The active space
 * whenever the dataset will be visible there, so an edit made in place keeps the
 * id it already has; otherwise the first space it is being created for.
 *
 * Lives beside {@link getDatasetId} because the two decide one thing between
 * them: which space a dataset's id comes from.
 */
export declare const resolveDatasetHomeSpace: (activeSpaceId: string, targetSpaceIds: string[]) => string;
