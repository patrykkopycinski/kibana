import type { SavedObjectBulkResult } from '../..';
/**
 * Base options used by most of the savedObject APIs.
 * @public
 */
export interface SavedObjectsBaseOptions {
    /** Specify the namespace for this operation */
    namespace?: string;
}
/**
 * Elasticsearch Refresh setting for mutating operation
 * @public
 */
export type MutatingOperationRefreshSetting = boolean | 'wait_for';
/**
 * Base return for saved object bulk operations
 *
 * @public
 */
export interface SavedObjectsBulkResponse<T = unknown> {
    /** array of saved objects, each of which is either a successful result or an error result */
    saved_objects: Array<SavedObjectBulkResult<T>>;
}
