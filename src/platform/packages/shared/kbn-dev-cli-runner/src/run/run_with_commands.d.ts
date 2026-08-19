import type { RunContext, RunOptions } from './types';
import type { FlagOptions } from '../flags/types';
export type CommandRunFn<T> = (context: RunContext & T) => Promise<void> | void;
export interface Command<T> {
    name: string;
    run: CommandRunFn<T>;
    description: RunOptions['description'];
    usage?: RunOptions['usage'];
    flags?: FlagOptions;
}
export interface RunWithCommandsOptions<T> {
    log?: RunOptions['log'];
    description?: RunOptions['description'];
    usage?: RunOptions['usage'];
    globalFlags?: FlagOptions;
    extendContext?(context: RunContext): Promise<T> | T;
}
export declare class RunWithCommands<T> {
    private readonly options;
    private readonly commands;
    constructor(options: RunWithCommandsOptions<T>, commands?: Array<Command<T>>);
    command(options: Command<T>): RunWithCommands<T>;
    execute(): Promise<void>;
}
