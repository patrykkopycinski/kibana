import type semver from 'semver';
export declare class EsVersion {
    static getDefault(): EsVersion;
    readonly parsed: semver.SemVer;
    constructor(version: string);
    toJSON(): string;
    toString(): string;
    /**
     * Determine if the ES version matches a semver range, like >=7 or ^8.1.0
     */
    matchRange(range: string): boolean;
    /**
     * Determine if the ES version matches a specific version, ignores things like -SNAPSHOT
     */
    eql(version: string): boolean | null;
}
