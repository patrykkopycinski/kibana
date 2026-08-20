type Coalesce<T extends any[]> = T extends [infer T1, ...infer TTail] ? T1 extends null | undefined | false ? Coalesce<TTail> : T1 : T extends [infer T1] ? T1 : false;
type FlagsToObj<T extends string[] | undefined, TValue> = string[] extends T ? {} : T extends string[] ? {
    [key in T[number] & string]?: TValue;
} : {};
type IsStringLiteral<T extends string[] | undefined> = string[] extends T ? false : undefined extends T ? false : true;
type IsTypedFlagOptions<TFlagOptions extends FlagOptions> = Coalesce<[
    IsStringLiteral<TFlagOptions['string']>,
    IsStringLiteral<TFlagOptions['boolean']>
]>;
interface UnspecifiedFlags {
    [key: string]: string | string[] | boolean | undefined;
}
/**
 * Infer the type of Flags from FlagOptions. Inference only kicks in when
 * either `string` or `boolean` consists of string literals (which only
 * is the case when the flag options are tagged with the `as const` modifier.)
 * Otherwise the type we create is too specific and we'd have to use `as const`
 * everywhere.
 */
export type FlagsOf<TFlagOptions extends FlagOptions> = IsTypedFlagOptions<TFlagOptions> extends true ? BaseFlags<(true extends TFlagOptions['allowUnexpected'] ? UnspecifiedFlags : {}) & (TFlagOptions['string'] extends string[] ? FlagsToObj<TFlagOptions['string'], string> : {}) & (TFlagOptions['boolean'] extends string[] ? FlagsToObj<TFlagOptions['boolean'], boolean> : {})> : Flags;
/**
 * Base variant of Flags that does not automatically set unspecified
 * flags `([key:string]: ...)`
 */
export type BaseFlags<TExtraFlags extends UnspecifiedFlags = {}> = {
    verbose: boolean;
    quiet: boolean;
    silent: boolean;
    debug: boolean;
    help: boolean;
    _: string[];
    unexpected: string[];
} & TExtraFlags;
export type Flags = BaseFlags<UnspecifiedFlags>;
export interface FlagHelpItem {
    flag: string;
    description: string;
}
export interface FlagOptions {
    allowUnexpected?: boolean;
    guessTypesForUnexpectedFlags?: boolean;
    help?: string | FlagHelpItem[];
    examples?: string;
    alias?: {
        [key: string]: string | string[];
    };
    boolean?: string[];
    string?: string[];
    default?: {
        [key: string]: any;
    };
}
export {};
