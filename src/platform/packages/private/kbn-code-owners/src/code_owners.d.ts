import type { Ignore } from 'ignore';
import type { CodeOwnerArea } from './code_owner_areas';
export interface CodeOwnersEntry {
    pattern: string;
    matcher: Ignore;
    teams: string[];
    areas: CodeOwnerArea[];
    comment?: string;
}
/**
 * Generator function that yields lines from the CODEOWNERS file
 */
export declare function getCodeOwnersLines(): Generator<string>;
/**
 * Get all code owner entries from the CODEOWNERS file
 *
 * Entries are ordered in reverse relative to how they're defined in the CODEOWNERS file
 * as patterns defined lower in the CODEOWNERS file can override earlier entries.
 */
export declare function getCodeOwnersEntries(): CodeOwnersEntry[];
/**
 * Get a list of matching code owners for a given path
 *
 * Tip:
 *   If you're making a lot of calls to this function, fetch the code owner paths once using
 *   `getCodeOwnersEntries` and pass it in the `getCodeOwnersEntries` parameter to speed up your queries.
 *
 * @param searchPath The path to find code owners for
 * @param codeOwnersEntries Pre-defined list of code owner paths to search in
 *
 * @returns Code owners entry if a match is found.
 * @throws Error if `searchPath` does not exist or is not part of this repository
 */
export declare function findCodeOwnersEntryForPath(searchPath: string, codeOwnersEntries?: CodeOwnersEntry[]): CodeOwnersEntry | undefined;
/**
 * Get a list of matching code owners for a given path
 *
 * Tip:
 *   If you're making a lot of calls to this function, fetch the code owner paths once using
 *   `getCodeOwnersEntries` and pass it in the `getCodeOwnersEntries` parameter to speed up your queries.
 *
 * @param searchPath The path to find code owners for
 * @param codeOwnersEntries Pre-defined list of code owner entries
 *
 * @returns List of code owners for the given path. Empty list if no matching entry is found.
 * @throws Error if `searchPath` does not exist or is not part of this repository
 */
export declare function getOwningTeamsForPath(searchPath: string, codeOwnersEntries?: CodeOwnersEntry[]): string[];
