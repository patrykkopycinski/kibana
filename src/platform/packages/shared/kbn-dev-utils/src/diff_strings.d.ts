/**
 * Produces a diff string which is nicely formatted to show the differences between two strings. This will
 * be a multi-line string so it's generally a good idea to include a `\n` before this first line of the diff
 * if you are concatenating it with another message.
 */
export declare function diffStrings(expected: string, received: string): string | undefined;
