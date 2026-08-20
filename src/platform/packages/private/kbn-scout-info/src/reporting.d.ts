export declare const SCOUT_REPORTER_ENABLED: boolean;
export declare const SCOUT_REPORTER_ES_URL: string | undefined;
export declare const SCOUT_REPORTER_ES_API_KEY: string | undefined;
export declare const SCOUT_REPORTER_ES_VERIFY_CERTS: boolean;
export declare const SCOUT_TEST_EVENTS_TEMPLATE_NAME: string;
export declare const SCOUT_TEST_EVENTS_INDEX_PATTERN: string;
export declare const SCOUT_TEST_EVENTS_DATA_STREAM_NAME: string;
export declare const BROWSER_CONSOLE_ERRORS_ATTACHMENT = "browser-console-errors";
export declare enum ScoutTestRunConfigCategory {
    UI_TEST = "ui-test",
    API_TEST = "api-test",
    UNIT_TEST = "unit-test",
    UNIT_INTEGRATION_TEST = "unit-integration-test",
    UNKNOWN = "unknown"
}
