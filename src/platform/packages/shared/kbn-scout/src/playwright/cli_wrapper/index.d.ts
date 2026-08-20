import type { runPlaywrightTestCLI } from './run_tests';
import type { runPlaywrightCLI } from './common';
export declare const playwrightCLI: {
    run: typeof runPlaywrightCLI;
    test: typeof runPlaywrightTestCLI;
};
