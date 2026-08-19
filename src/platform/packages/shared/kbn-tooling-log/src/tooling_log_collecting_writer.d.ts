import { ToolingLogTextWriter } from './tooling_log_text_writer';
import type { LogLevel } from './log_levels';
import type { Message } from './message';
export declare class ToolingLogCollectingWriter extends ToolingLogTextWriter {
    messages: string[];
    constructor(level?: LogLevel);
    /**
     * Called by ToolingLog, extends messages with the source and context if message include it.
     */
    write(msg: Message): boolean;
}
