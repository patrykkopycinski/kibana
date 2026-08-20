declare const __spaceIdBrand: unique symbol;
/**
 * A branded string type for Kibana space identifiers.
 *
 * Use {@link asSpaceId} to create a `SpaceId` from an untrusted string
 * (validates the format), or {@link DEFAULT_SPACE_ID} for the built-in
 * default space.
 */
export type SpaceId = string & {
    readonly [__spaceIdBrand]: never;
};
/**
 * Validates and brands a plain string as a {@link SpaceId}.
 *
 * Use this at untrusted write/ingress boundaries — where a space id first enters
 * the system from an unvalidated source (e.g. the space create/update API, or URL
 * path parsing). For already-trusted values (persisted saved objects, task
 * state/params, request-derived ids, server-injected metadata) use
 * {@link brandSpaceId} instead: re-validating on read cannot repair a malformed
 * value and only risks throwing on legacy/corrupt data.
 *
 * @throws if `value` does not match `/^[a-z0-9_-]+$/`
 */
export declare const asSpaceId: (value: string) => SpaceId;
/**
 * Re-brands an already-trusted string as a {@link SpaceId} without re-validating.
 *
 * This is a trusted-boundary re-brand for values that were format-validated when
 * they first entered the system (space creation, URL ingress) and have since been
 * persisted or propagated — e.g. saved-object fields, task state/params,
 * request-derived ids, and server-injected metadata. Unlike {@link asSpaceId} it
 * never throws, so a legacy or corrupt persisted value can't silently take a rule
 * out of execution or crash a render/bootstrap path.
 */
export declare const brandSpaceId: (value: string) => SpaceId;
/**
 * The identifier of the built-in default Kibana space.
 */
export declare const DEFAULT_SPACE_ID: SpaceId;
/**
 * Returns the URL path prefix for the given space (`/s/<spaceId>`),
 * or an empty string for the default space.
 */
export declare const getSpaceUrlPrefix: (spaceId: SpaceId) => string;
export {};
