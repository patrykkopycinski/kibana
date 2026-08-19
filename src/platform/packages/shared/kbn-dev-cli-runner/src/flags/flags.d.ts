import type { FlagOptions, Flags } from './types';
export declare function mergeFlagOptions(global?: FlagOptions, local?: FlagOptions): FlagOptions;
export declare const DEFAULT_FLAG_ALIASES: {
    v: string;
};
export declare function getFlags(argv: string[], flagOptions?: FlagOptions, defaultLogLevel?: string): Flags;
