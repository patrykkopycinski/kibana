import type { TestType } from 'playwright/test';
import type { CoreWorkerFixtures, EsArchiverFixture, LinkedProjectFixture, RequestAuthFixture, ApiClientFixture, DefaultRolesFixture, ApiServicesFixture } from '../../fixtures/scope/worker';
/**
 * Minimal set of fixtures for API tests.
 */
export interface ApiWorkerFixtures extends CoreWorkerFixtures {
    apiClient: ApiClientFixture;
    apiServices: ApiServicesFixture;
    defaultRolesFixture: DefaultRolesFixture;
    requestAuth: RequestAuthFixture;
    esArchiver: EsArchiverFixture;
    linkedProject: LinkedProjectFixture;
}
/**
 * API test type with minimal fixtures.
 * This is used for Scout api tests that do not require browser interaction.
 */
export declare const apiTest: TestType<{}, ApiWorkerFixtures>;
