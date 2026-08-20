/**
 *  Trace the path followed as dependencies are loaded and
 *  check for circular dependencies at each step
 *
 *  @param  {Any} ident identity of this load step, === compared
 *                         to identities of previous steps to find circles
 *  @param  {String} description description of this step
 *  @param  {Function} load function that executes this step
 *  @return {Any} the value produced by load()
 */
export declare function loadTracer(ident: any, description: string, load: () => Promise<void> | void): void | Promise<void>;
