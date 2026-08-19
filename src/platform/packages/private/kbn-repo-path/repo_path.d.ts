export declare class RepoPath {
    /** root path of the repo where this file was found */
    readonly repoRoot: string;
    /** repo-relative path to the file */
    readonly repoRel: string;
    constructor(
    /** root path of the repo where this file was found */
    repoRoot: string, 
    /** repo-relative path to the file */
    repoRel: string);
    private _abs;
    /**
     * absolute path to the file
     * (lazy and cached getter)
     */
    get abs(): string;
    private _ext;
    /**
     * extension to the filename
     * (lazy and cached getter)
     */
    get ext(): string;
    private _basename;
    /**
     * basename of the path (including extension)
     * (lazy and cached getter)
     */
    get basename(): string;
    private _repoRelDir;
    /**
     * repoRelDir of the path
     * (lazy and cached getter)
     */
    get repoRelDir(): string;
    isTypeScript(): boolean;
    isTypeScriptAmbient(): boolean;
    isJavaScript(): boolean;
    isJsTsCode(): boolean;
    isFixture(): boolean;
}
