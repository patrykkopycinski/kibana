export type ValidationScope = 'staged' | 'local' | 'branch' | 'full';
export type ValidationTestMode = 'related' | 'affected' | 'all';
export type ValidationDownstreamMode = 'none' | 'direct' | 'deep';
export type ValidationProfile = 'precommit' | 'quick' | 'agent' | 'branch' | 'pr' | 'full';
export interface ValidationProfileDefaults {
    scope: ValidationScope;
    testMode: ValidationTestMode;
    downstream: ValidationDownstreamMode;
}
export declare const VALIDATION_PROFILE_DEFAULTS: Readonly<Record<ValidationProfile, Readonly<ValidationProfileDefaults>>>;
export interface ResolvedValidationContract {
    profile: ValidationProfile;
    scope: ValidationScope;
    testMode: ValidationTestMode;
    downstream: ValidationDownstreamMode;
    baseRef?: string;
    headRef?: string;
}
/** Parses, resolves, and validates validation-contract flags in one call. */
export declare const parseAndResolveValidationContract: ({ profile, scope, testMode, downstream, baseRef, headRef, }: {
    profile?: string;
    scope?: string;
    testMode?: string;
    downstream?: string;
    baseRef?: string;
    headRef?: string;
}) => ResolvedValidationContract;
