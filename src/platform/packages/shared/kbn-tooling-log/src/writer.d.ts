import type { Message } from './message';
/**
 * An object which received ToolingLog `Messages` and sends them to
 * some interface for collecting logs like stdio, or a file
 */
export interface Writer {
    /**
     * Called with every log message, should return true if the message
     * was written and false if it was ignored.
     * @param msg The log message to write
     */
    write(msg: Message): boolean;
}
