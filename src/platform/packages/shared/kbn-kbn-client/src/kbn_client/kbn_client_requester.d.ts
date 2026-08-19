import type { ToolingLog } from '@kbn/tooling-log';
/**
 * Type of the response body expected from the server, which determines how the body is parsed and returned. Mirrors the
 * accepted `responseType` values from axios, but adapted to the native fetch API's parsing methods.
 */
export type ResponseType = 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream';
/**
 * Envelope returned by `KbnClientRequester.request()`. Mirrors the subset of
 * `AxiosResponse<T>` that callers in this package consumed (`.data`, `.status`,
 * `.headers`, `.statusText`) so existing call sites that destructure
 * `const { data } = ...` keep working.
 */
export interface KbnClientResponse<T = unknown> {
    data: T;
    status: number;
    statusText: string;
    headers: Headers;
}
/**
 * Creates a template literal tag which will uriencode the variables in a template literal
 * as well as prefix the path with a specific space if one is defined
 */
export declare const pathWithSpace: (space?: string) => (strings: TemplateStringsArray, ...args: Array<string | number>) => string;
export declare const uriencode: (strings: TemplateStringsArray, ...values: Array<string | number | boolean>) => string;
export interface ReqOptions {
    description?: string;
    path: string;
    query?: Record<string, any>;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    body?: any;
    retries?: number;
    headers?: Record<string, string>;
    ignoreErrors?: number[];
    responseType?: ResponseType;
    signal?: AbortSignal;
}
interface Options {
    url: string;
    certificateAuthorities?: Buffer[];
}
export declare class KbnClientRequester {
    private readonly log;
    private readonly url;
    private readonly urlForFetch;
    private readonly authorization?;
    private readonly dispatcher;
    constructor(log: ToolingLog, options: Options);
    resolveUrl(relativeUrl?: string): string;
    private resolveUrlInternal;
    request<T>(options: ReqOptions): Promise<KbnClientResponse<T>>;
}
export declare function errMsg({ redacted, requestedRetries, maxAttempts, failedToGetResponseSvc, path, method, description, }: ReqOptions & {
    redacted: string;
    maxAttempts: number;
    requestedRetries: boolean;
    failedToGetResponseSvc: (x: Error) => boolean;
}): (attempt: number, _: any) => string;
export declare function redactUrl(_: string): string;
export {};
