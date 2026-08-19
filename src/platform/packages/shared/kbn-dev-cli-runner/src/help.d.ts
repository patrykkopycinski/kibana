import type { FlagHelpItem } from './flags/types';
import type { Command } from './run/run_with_commands';
export declare const GLOBAL_FLAGS: string;
export declare function formatFlagHelpItems(items: FlagHelpItem[]): string;
export declare function indent(str: string, depth: number): string;
export declare function joinAndTrimLines(...strings: Array<string | undefined>): string;
export declare function getHelp({ description, usage, flagHelp, defaultLogLevel, examples, }: {
    description?: string;
    usage?: string;
    flagHelp?: string | FlagHelpItem[];
    defaultLogLevel?: string;
    examples?: string;
}): string;
export declare function getCommandLevelHelp({ usage, globalFlagHelp, command, }: {
    usage?: string;
    globalFlagHelp?: string | FlagHelpItem[];
    command: Command<any>;
}): string;
export declare function getHelpForAllCommands({ description, usage, globalFlagHelp, commands, }: {
    description?: string;
    usage?: string;
    globalFlagHelp?: string | FlagHelpItem[];
    commands: Array<Command<any>>;
}): string;
