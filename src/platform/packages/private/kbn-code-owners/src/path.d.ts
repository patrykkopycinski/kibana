import fs from 'node:fs';
/** CODEOWNERS file path **/
export declare const CODE_OWNERS_FILE: string;
/**
 * Throw an error if the given path does not exist
 *
 * @param targetPath Path to check
 * @param description Path description used in the error message if an exception is thrown
 * @param cli Whether this function is called from a CLI context
 */
export declare function throwIfPathIsMissing(targetPath: fs.PathLike, description?: string, cli?: boolean): void;
/**
 * Throw an error if the given path does not reside in this repo
 *
 * @param targetPath Path to check
 * @param cli Whether this function is called from a CLI context
 */
export declare function throwIfPathNotInRepo(targetPath: fs.PathLike, cli?: boolean): void;
