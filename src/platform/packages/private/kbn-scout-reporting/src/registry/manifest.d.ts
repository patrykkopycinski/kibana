import type { TestCase } from '@playwright/test/reporter';
import type { ScoutTestChannel } from '@kbn/scout-info';
export declare const getGitSHA1ForPath: (p: string) => Promise<string>;
export interface ScoutConfigManifest {
    path: string;
    exists: boolean;
    sha1: string;
    testChannels: ScoutTestChannel[];
    tests: {
        id: string;
        title: string;
        expectedStatus: string;
        tags: string[];
        location: TestCase['location'];
    }[];
}
export declare const testConfigManifests: {
    findPaths(): string[];
};
