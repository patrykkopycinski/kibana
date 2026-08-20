/**
 *  Wraps a "runnable" defining function (it(), beforeEach(), etc.)
 *  so that any "runnable" arguments passed to it are wrapped and will
 *  trigger a lifecycle event if they throw an error.
 */
export declare function wrapRunnableArgs(fn: any, lifecycle: any, handler: any, options?: {}): Any;
