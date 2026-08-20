/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * User data structure for seeding
 */
export interface TestUserData {
  userId: string;
  email?: string;
  firstName: string;
  lastName?: string;
  organizationId: string;
  roleId: string;
  projectType: string;
  applicationRoles: string[];
}
/**
 * Api key data structure for seeding.
 */
export interface TestApiKeyData {
  creator: string;
  organizationId: string;
}
/**
 * Seed a test user in Cosmos DB
 *
 * @param userData - User data to seed
 * @returns Promise that resolves when user is created or already exists
 *
 * @example
 * ```typescript
 * await seedTestUser({
 *   userId: '12345',
 *   email: 'test@elastic.co',
 *   firstName: 'Test',
 *   lastName: 'User',
 *   organizationId: '1234567890',
 *   roleId: 'cloud-role-id',
 *   projectType: 'observability',
 *   applicationRoles: ['viewer', 'editor'],
 * });
 * ```
 */
export declare function seedTestUser(userData: TestUserData): Promise<{
  success: boolean;
  message: string;
  response?: any;
}>;
/**
 * Update an existing test user in Cosmos DB
 *
 * @param userData - User data to update
 * @returns Promise that resolves when user is updated
 *
 * @example
 * ```typescript
 * await updateTestUser({
 *   userId: '12345',
 *   email: 'updated@elastic.co',
 *   firstName: 'Updated',
 *   lastName: 'User',
 *   organizationId: '1234567890',
 *   roleId: 'cloud-role-id',
 *   projectType: 'security',
 *   applicationRoles: ['admin', 'editor'],
 * });
 * ```
 */
export declare function updateTestUser(userData: TestUserData): Promise<{
  success: boolean;
  message: string;
  response?: any;
}>;
/**
 * Seed a test Api Key in Cosmos DB
 *
 * @param apiKeyData - Api key data to seed.
 * @returns Promise that resolves when api key is created or already exists
 *
 * @example
 * ```ts
 * await seedTestApiKey({
 *   creator: '12345',
 *   organizationId: '1234567890'
 * });
 * ```
 */
export declare function seedTestApiKey(apiKeyData: TestApiKeyData): Promise<{
  success: boolean;
  message: string;
  response?: any;
}>;
/**
 * Update an existing API key in Cosmos DB.
 *
 * @param apiKeyData - API key data to update
 * @returns Promise that resolves when API key is updated
 *
 * @example
 * ```ts
 * await updateTestApiKey({
 *   creator: '12345',
 *   organizationId: '1234567890'
 * });
 * ```
 */
export declare function updateTestApiKey(apiKeyData: TestApiKeyData): Promise<{
  success: boolean;
  message: string;
  response?: any;
}>;
interface TestOAuthConnectionData {
  connectionId: string;
  clientId: string;
  organizationId: string;
  userId: string;
  resource: string;
  name?: string;
  nameOrigin?: 'generated' | 'user-defined';
  scopes?: string[];
  revoked?: boolean;
  expired?: boolean;
  created?: string;
}
/**
 * Seed a test OAuth connection in Cosmos DB.
 *
 * @param connectionData - Connection data to seed.
 * @returns Promise that resolves when the connection is created.
 *
 * @example
 * ```ts
 * await seedTestOAuthConnection({
 *   connectionId: 'conn-123',
 *   clientId: 'client-abc',
 *   organizationId: 'org1234567890',
 *   userId: '1234567890',
 *   resource: 'http://localhost:5620/api/agent_builder/mcp',
 *   name: 'My connection',
 *   scopes: ['all'],
 * });
 * ```
 */
export declare function seedTestOAuthConnection(connectionData: TestOAuthConnectionData): Promise<{
  success: boolean;
  message: string;
  response?: any;
}>;
/**
 * Update (replace) an existing OAuth connection in Cosmos DB.
 *
 * @param connectionData - Connection data to update.
 * @returns Promise that resolves when the connection is updated.
 */
export declare function updateTestOAuthConnection(
  connectionData: TestOAuthConnectionData
): Promise<{
  success: boolean;
  message: string;
  response?: any;
}>;
/**
 * Delete a seeded OAuth connection from Cosmos DB.
 *
 * @param connectionId - The connection document id.
 * @param clientId - The owning client id (partition key).
 * @returns Promise that resolves when the connection is deleted or absent.
 */
export declare function deleteTestOAuthConnection({
  connectionId,
  clientId,
}: {
  connectionId: string;
  clientId: string;
}): Promise<{
  success: boolean;
  message: string;
}>;
export {};
