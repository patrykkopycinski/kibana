/**
 * Traverse the suites configured and ensure that each suite has no more than one ciGroup assigned
 *
 * @param {ToolingLog} log
 * @param {Mocha} mocha
 */
export declare function validateCiGroupTags(log: ToolingLog, mocha: Mocha): void;
