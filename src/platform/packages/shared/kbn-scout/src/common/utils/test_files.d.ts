export interface TestFilesValidationResult {
    testFiles: string[];
    configPath: string;
}
/**
 * Validates and processes test files or directories, deriving the appropriate config path
 * @param testFilesList Comma-separated string of test file/directory paths
 * @returns Validation result with processed test files and derived config path
 */
export declare function validateAndProcessTestFiles(testFilesList: string): TestFilesValidationResult;
