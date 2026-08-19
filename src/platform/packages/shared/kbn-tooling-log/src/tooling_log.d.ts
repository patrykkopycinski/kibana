import * as Rx from 'rxjs';
import type { SomeDevLog } from '@kbn/some-dev-log';
import type { ToolingLogTextWriterConfig } from './tooling_log_text_writer';
import type { Writer } from './writer';
import type { Message } from './message';
export interface ToolingLogOptions {
    /**
     * type name for this logger, will be assigned to the "source"
     * properties of messages produced by this logger
     */
    type?: string;
    /**
     * parent ToolingLog. When a ToolingLog has a parent they will both
     * share indent and writers state. Changing the indent width or
     * writers on either log will update the other too.
     */
    parent?: ToolingLog;
    /**
     * A string, conveniently the name of the script,
     * that will be prepended to log messages.
     * Can be useful to identify which entity is emitting the log.
     */
    context?: string | string[];
}
export declare class ToolingLog implements SomeDevLog {
    private indentWidth$;
    private writers$;
    private readonly written$;
    private readonly type;
    private readonly context;
    constructor(writerConfig?: ToolingLogTextWriterConfig, options?: ToolingLogOptions);
    /**
     * Get the current indentation level of the ToolingLog
     */
    getIndent(): number;
    /**
     * Indent the output of the ToolingLog by some character (4 is a good choice usually).
     *
     * If provided, the `block` function will be executed and once it's promise is resolved
     * or rejected the indentation will be reset to its original state.
     *
     * @param delta the number of spaces to increase/decrease the indentation
     * @param block a function to run and reset any indentation changes after
     */
    indent(delta: number): void;
    indent<T>(delta: number, block: () => Promise<T>): Promise<T>;
    indent<T>(delta: number, block: () => T): T;
    verbose(...args: any[]): void;
    debug(...args: any[]): void;
    info(...args: any[]): void;
    success(...args: any[]): void;
    warning(...args: any[]): void;
    error(error: Error | string): void;
    write(...args: any[]): void;
    getWriters(): Writer[];
    setWriters(writers: Writer[]): void;
    getWritten$(): Rx.Observable<Message>;
    /**
     * Create a new ToolingLog which sets a different "type", allowing messages to be filtered out by "source"
     * @param type A string that will be passed along with messages from this logger which can be used to filter messages with `ignoreSources`
     */
    withType(type: string): ToolingLog;
    withContext(context: string): ToolingLog;
    private sendToWriters;
}
