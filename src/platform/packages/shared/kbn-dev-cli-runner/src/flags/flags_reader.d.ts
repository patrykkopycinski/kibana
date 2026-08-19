type FlagValue = string | string[] | boolean | number;
export declare class FlagsReader {
    private readonly opts?;
    private readonly used;
    private readonly unused;
    private readonly _;
    private readonly aliasMap;
    constructor(flags: Record<string, FlagValue | undefined>, opts?: {
        aliases?: Record<string, string>;
    } | undefined);
    private use;
    /**
     * Read a string flag that supports multiple instances into an array of strings. If the
     * flag is only passed once an array with a single item will be returned. If the flag is not
     * passed then undefined will be returned.
     */
    arrayOfStrings(key: string): string[] | undefined;
    /**
     * Same as #arrayOfStrings() except when the flag is not passed a "flag error" is thrown telling
     * the user that the flag is required and shows them the help text.
     */
    requiredArrayOfStrings(key: string): string[];
    /**
     * Read the value of a string flag. If the flag is passed multiple times the last value is returned. If
     * the flag is not passed then undefined is returned.
     */
    string(key: string): string | undefined;
    /**
     * Same as #string() except when the flag is passed it is validated against a list
     * of valid values
     */
    enum<T extends string>(key: string, values: readonly T[]): T | undefined;
    /**
     * Same as #string() except when a flag is not passed a "flag error" is thrown telling the user
     * that the flag is required and shows them the help text.
     */
    requiredString(key: string): string;
    /**
     * Same as #string(), except that when there is a value for the string it is resolved to an
     * absolute path based on the current working directory
     */
    path(key: string): string | undefined;
    /**
     * Same as #requiredString() except that values are converted to absolute paths based on the
     * current working directory
     */
    requiredPath(key: string): string;
    /**
     * Same as #arrayOfStrings(), except that when there are values they are resolved to
     * absolute paths based on the current working directory
     */
    arrayOfPaths(key: string): string[] | undefined;
    /**
     * Same as #requiredArrayOfStrings(), except that values are resolved to absolute paths
     * based on the current working directory
     */
    requiredArrayOfPaths(key: string): string[];
    /**
     * Parsed the provided flag as a number, if the value does not parse to a valid number
     * using Number.parseFloat() then a "flag error" is thrown. If the flag is not passed
     * undefined is returned.
     */
    number(key: string): number | undefined;
    /**
     * Same as #number() except that when the flag is missing a "flag error" is thrown
     */
    requiredNumber(key: string): number;
    /**
     * Read a boolean flag value, if the flag is properly defined as a "boolean" in the run options
     * then the value will always be a boolean, defaulting to `false`, so there is no need for an
     * optional/requiredBoolean() method.
     */
    boolean(key: string): boolean;
    /**
     * Get the positional arguments passed, includes any values that are not associated with
     * a specific --flag
     */
    getPositionals(): string[];
    /**
     * Returns all of the unused flags. When a flag is read via any of the key-specific methods
     * the key is marked as "used" and this method will return a map of just the flags which
     * have not been used yet (excluding the default flags like --debug, --verbose, and --help)
     */
    getUnused(): Map<string, FlagValue>;
    /**
     * Returns all of the used flags. When a flag is read via any of the key-specific methods
     * the key is marked as "used" and from then on this method will return a map including that
     * and any other key used by these methods.
     */
    getUsed(): Map<string, FlagValue>;
}
export {};
