declare const FAIL_TAG: unique symbol;
interface FailError extends Error {
    exitCode: number;
    showHelp: boolean;
    [FAIL_TAG]: true;
}
interface FailErrorOptions {
    exitCode?: number;
    showHelp?: boolean;
}
export declare function createFailError(reason: string, options?: FailErrorOptions): FailError;
export declare function createFlagError(reason: string): FailError;
export declare function isFailError(error: any): error is FailError;
export declare function combineErrors(errors: Array<Error | FailError>): Error;
export {};
