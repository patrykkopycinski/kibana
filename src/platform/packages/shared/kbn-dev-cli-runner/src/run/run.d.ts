import type { RunFn, RunOptions } from './types';
import type { FlagOptions, FlagsOf } from '../flags/types';
export declare function run<T, TFlagOptions extends FlagOptions = FlagOptions>(fn: RunFn<T, FlagsOf<TFlagOptions>>, options?: RunOptions<TFlagOptions>): Promise<T | undefined>;
