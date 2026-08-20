import type { FlagHelpItem } from '@kbn/dev-cli-runner';
import type { ResolvedValidationContract } from '@kbn/dev-utils';
import type { MoonAffectedBase } from '@kbn/moon';
import type { ValidationRunFlagsInput } from './resolve_validation_run_context';
/** Shared validation flag names used by validation-style CLIs. */
export declare const VALIDATION_RUN_STRING_FLAGS: readonly ['profile', 'scope', 'test-mode', 'base-ref', 'head-ref', 'downstream'];
/** Shared validation flag help items for CLI usage messages. */
export declare const VALIDATION_RUN_HELP: FlagHelpItem[];
/** Minimal flags reader contract needed to parse shared validation flags. */
export interface ValidationRunFlagsReader {
    string: (name: string) => string | undefined;
}
/** Inputs for building consistent log/reproduction args from a resolved validation contract. */
export interface BuildValidationCliArgsOptions {
    contract?: ResolvedValidationContract;
    resolvedBase?: MoonAffectedBase;
    directTarget?: {
        flag: string;
        value: string;
    };
    forceFullProfile?: boolean;
}
/** Generated args for command logs and CI/local reproduction output. */
export interface ValidationCliArgs {
    logArgs: string[];
    reproductionArgs: string[];
}
/** Returns true when any shared validation-contract flag is present in raw CLI args. */
export declare const hasValidationRunFlags: (args: string[]) => boolean;
/** Formats a reproduction command from a script name and CLI args. */
export declare const formatReproductionCommand: (scriptName: string, args: string[]) => string;
/** Reads shared validation flags from a command flags reader. */
export declare const readValidationRunFlags: (flagsReader: ValidationRunFlagsReader) => ValidationRunFlagsInput;
/** Builds shared validation CLI args for command logs and reproduction commands. */
export declare const buildValidationCliArgs: ({ contract, resolvedBase, directTarget, forceFullProfile, }: BuildValidationCliArgsOptions) => ValidationCliArgs;
