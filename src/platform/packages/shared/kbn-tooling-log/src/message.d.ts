export type MessageTypes = 'verbose' | 'debug' | 'info' | 'success' | 'warning' | 'error' | 'write';
/**
 * The object shape passed to ToolingLog writers each time the log is used.
 */
export interface Message {
    /** level/type of message */
    type: MessageTypes;
    /** indentation intended when message written to a text log */
    indent: number;
    /** type of logger this message came from */
    source?: string;
    /** args passed to the logging method */
    args: any[];
    /** an identifier of the logging entity */
    context?: string | string[];
}
