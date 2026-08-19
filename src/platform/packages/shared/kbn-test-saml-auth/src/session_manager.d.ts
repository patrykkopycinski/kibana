import type { ToolingLog } from '@kbn/tooling-log';
import type { ServerlessProjectType } from '@kbn/es';
export interface HostOptions {
    protocol: 'http' | 'https';
    hostname: string;
    port?: number;
    username: string;
    password: string;
}
export interface SamlSessionManagerOptions {
    hostOptions: HostOptions;
    isCloud: boolean;
    supportedRoles?: SupportedRoles;
    cloudHostName?: string;
    cloudUsersFilePath: string;
    serverless?: SamlSessionManagerServerlessOptions;
    log: ToolingLog;
}
export interface SamlSessionManagerServerlessOptions {
    uiam: boolean;
    projectType: ServerlessProjectType;
    organizationId: string;
}
export interface SupportedRoles {
    sourcePath: string;
    roles: string[];
}
export interface GetCookieOptions {
    forceNewSession?: boolean;
    spaceId?: string;
}
/**
 * Manages cookies associated with user roles
 */
export declare class SamlSessionManager {
    private readonly isCloud;
    private readonly kbnHost;
    private readonly kbnUsername;
    private readonly kbnPassword;
    private kbnVersionResolved?;
    private readonly log;
    private readonly roleToUserMap;
    private readonly sessionCache;
    private readonly supportedRoles?;
    private readonly cloudHostName?;
    private readonly cloudUsersFilePath;
    private readonly serverless?;
    constructor(options: SamlSessionManagerOptions);
    private getKibanaVersionForCloudSaml;
    private validateCloudHostName;
    /**
     * Validates if the 'kbnHost' points to Cloud, even if 'isCloud' was set to false
     */
    private validateCloudSetting;
    /**
     * Loads cloud users from '.ftr/role_users.json'
     * QAF prepares the file for CI pipelines, make sure to add it manually for local run
     */
    private getCloudUsers;
    private getCloudUserByRole;
    private getSessionByRole;
    private createSessionForRole;
    validateRole: (role: string) => void;
    getApiCredentialsForRole(role: string, options?: GetCookieOptions): Promise<{
        Cookie: string;
    }>;
    getInteractiveUserSessionCookieWithRoleScope(role: string, options?: GetCookieOptions): Promise<string>;
    getEmail(role: string): Promise<string>;
    getUserData(role: string): Promise<import("./types").UserProfile>;
    getSupportedRoles(): string[];
}
