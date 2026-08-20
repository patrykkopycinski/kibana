import type * as Rx from 'rxjs';
import type { ToolingLog } from '@kbn/tooling-log';
/**
 * Create an observable that errors if a docker
 * container exits before being unsubscribed
 */
export declare function observeContainerRunning(name: string, containerId: string, log: ToolingLog): Rx.Observable<unknown>;
