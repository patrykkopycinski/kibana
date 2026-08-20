/**
 * Narrow init types needed by current Kibana consumers of `useSearchParams`.
 * This is intentionally not a full React Router v6 surface.
 */
export type URLSearchParamsInit = string | URLSearchParams | Record<string, string | string[]> | Array<[string, string]> | undefined;
export type SetURLSearchParams = (nextInit: URLSearchParamsInit | ((prev: URLSearchParams) => URLSearchParamsInit), navigateOpts?: {
    replace?: boolean;
}) => void;
/**
 * v5-backed replacement for React Router's `useSearchParams`.
 *
 * Preserves the tuple shape, functional updates, push/replace behavior, and
 * URLSearchParams encoding expected by current Kibana consumers.
 */
export declare const useSearchParams: (defaultInit?: URLSearchParamsInit) => [URLSearchParams, SetURLSearchParams];
