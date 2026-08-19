type AsyncInstance<T> = {
    init: () => Promise<T>;
} & T;
export declare const isAsyncInstance: <T = unknown>(val: any) => val is AsyncInstance<T>;
export declare const createAsyncInstance: <T>(type: string, name: string, promiseForValue: Promise<T>) => AsyncInstance<T>;
export {};
