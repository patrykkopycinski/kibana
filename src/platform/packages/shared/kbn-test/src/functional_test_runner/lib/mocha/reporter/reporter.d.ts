export declare function MochaReporterProvider({ getService }: {
    getService: any;
}): new (runner: any, options: any) => {
        onStart: () => void;
        onHookStart: (hook: any) => void;
        onHookEnd: () => void;
        onSuiteStart: (suite: any) => void;
        onSuiteEnd: () => void;
        onTestStart: (test: any) => void;
        onTestEnd: (test: any) => void;
        onPending: (test: any) => void;
        onPass: (test: any) => void;
        onFail: (runnable: any) => void;
        onEnd: () => void;
    };
