import { type ValidationRunContext, type ValidationRunFlagsInput } from './resolve_validation_run_context';
/** Context for direct-target execution where contract-driven Moon/Git resolution is skipped. */
export interface ValidationDirectTargetContext {
    mode: 'direct_target';
    directTarget: string;
}
/** Context for contract-driven execution where change-file scope has been resolved. */
export interface ValidationContractContext {
    mode: 'contract';
    contract: ValidationRunContext['contract'];
    runContext: ValidationRunContext;
}
export type ValidationBaseContext = ValidationDirectTargetContext | ValidationContractContext;
/** Options for resolving a reusable validation base context from CLI-facing flags. */
export interface ResolveValidationBaseContextOptions {
    flags: ValidationRunFlagsInput;
    directTarget?: string;
    runnerDescription?: string;
    onWarning?: (message: string) => void;
}
/**
 * Describes what revisions/change-scope a resolved validation context represents.
 * Consumers can log this once and keep command-level logs focused on tool-specific execution.
 */
export declare const describeValidationScope: (baseContext: ValidationBaseContext) => string;
/** Describes where no affected targets were searched for the current validation contract. */
export declare const describeValidationNoTargetsScope: (baseContext: ValidationBaseContext) => string;
/** Inputs for formatting a scoped-target summary from a resolved validation context. */
export interface DescribeValidationScopingOptions {
    baseContext: ValidationBaseContext;
    targetCount: number;
    targetNoun?: string;
}
/** Formats a human-readable "Checking ..." message for tool-specific target sets. */
export declare const describeValidationScoping: ({ baseContext, targetCount, targetNoun, }: DescribeValidationScopingOptions) => string;
/** Resolves reusable validation context once for either direct-target or contract-driven execution. */
export declare const resolveValidationBaseContext: ({ flags, directTarget, runnerDescription, onWarning, }: ResolveValidationBaseContextOptions) => Promise<ValidationBaseContext>;
