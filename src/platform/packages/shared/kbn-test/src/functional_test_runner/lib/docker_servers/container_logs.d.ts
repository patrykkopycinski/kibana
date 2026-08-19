import * as Rx from 'rxjs';
import type { ToolingLog } from '@kbn/tooling-log';
/**
 * Observe the logs for a container, reflecting the log lines
 * to the ToolingLog and the returned Observable
 */
export declare function observeContainerLogs(name: string, containerId: string, log: ToolingLog): Rx.Observable<string>;
/**
 * Check if a log line from stderr is actually an error or just info/debug written to stderr
 */
export declare function isActualError(line: string): boolean;
