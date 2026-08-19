import type { Readable } from 'stream';
import * as Rx from 'rxjs';
/**
 *  Produces an Observable from a ReadableSteam that:
 *   - completes on the first "end" event
 *   - fails on the first "error" event
 */
export declare function observeReadable(readable: Readable): Rx.Observable<never>;
