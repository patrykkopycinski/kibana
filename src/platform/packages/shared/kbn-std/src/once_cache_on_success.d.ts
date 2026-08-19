/**
 * Like lodash `once`, but only caches successful results. If the factory throws,
 * the next call retries rather than returning the cached failure (undefined).
 * This prevents silent bypasses when deferred construction fails on the first
 * call — subsequent calls will consistently fail with an error instead of
 * silently returning undefined.
 *
 * @public
 */
export declare function onceCacheOnSuccess<T>(factory: () => T): () => T;
