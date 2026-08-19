import type { Readable } from 'stream';
import * as Rx from 'rxjs';
/**
 *  Creates an Observable from a Readable Stream that:
 *   - splits data from `readable` into lines
 *   - completes when `readable` emits "end"
 *   - fails if `readable` emits "errors"
 *
 *  @param  {ReadableStream} readable
 *  @return {Rx.Observable}
 */
export declare function observeLines(readable: Readable): Rx.Observable<string>;
