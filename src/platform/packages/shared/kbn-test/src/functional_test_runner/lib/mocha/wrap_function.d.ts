/**
 *  Wrap the execution of a function with a series of Hooks
 *
 *  @param  {Function} fn
 *  @param  {Object} [hooks={}]
 *  @property {Function} hooks.before
 *  @property {Function} hooks.after
 *  @return {Any}
 */
export declare function wrapFunction(fn: Function, hooks?: Object): Any;
/**
 *  Wrap the execution of an async function with a series of Hooks
 *
 *  @param  {AsyncFunction} fn
 *  @param  {Object} [hooks={}]
 *  @property {AsyncFunction} hooks.before
 *  @property {AsyncFunction} hooks.handleError
 *  @property {AsyncFunction} hooks.after
 *  @return {Any}
 */
export declare function wrapAsyncFunction(fn: AsyncFunction, hooks?: Object): Any;
