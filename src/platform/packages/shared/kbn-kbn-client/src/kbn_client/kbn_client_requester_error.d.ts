/**
 * Error thrown by `KbnClientRequester` when an HTTP request fails after retries.
 * Exposes `.status` directly so callers can branch on the HTTP code (e.g. treat
 * 404 as "not found"), and `.headers` so callers can read response headers like
 * `Retry-After` for backoff. The underlying error is attached via `Error.cause`.
 */
export declare class KbnClientRequesterError extends Error {
    status?: number;
    headers?: Headers;
    constructor(message: string, options?: {
        status?: number;
        headers?: Headers;
        cause?: unknown;
    });
}
