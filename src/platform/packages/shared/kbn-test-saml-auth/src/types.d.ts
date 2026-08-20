import type { ToolingLog } from '@kbn/tooling-log';
export interface CloudSamlSessionParams {
    hostname: string;
    kbnHost: string;
    kbnVersion: string;
    email: string;
    password: string;
    log: ToolingLog;
}
export interface LocalSamlSessionParams {
    kbnHost: string;
    email: string;
    username: string;
    fullname: string;
    role: string;
    serverless?: {
        organizationId: string;
        projectType: string;
        uiamEnabled: boolean;
    };
    log: ToolingLog;
}
export interface CreateSamlSessionParams {
    hostname: string;
    email: string;
    password: string;
    log: ToolingLog;
}
export interface SAMLResponseValueParams {
    location: string;
    ecSession: string;
    email: string;
    kbnHost: string;
    log: ToolingLog;
}
export interface SAMLCallbackParams {
    kbnHost: string;
    samlResponse: string;
    sid?: string;
    log: ToolingLog;
    maxRetryCount?: number;
}
export interface User {
    readonly email: string;
    readonly password: string;
}
export type Role = string;
export interface UserProfile {
    username: string;
    roles: string[];
    full_name: string;
    email: string;
    enabled: boolean;
    elastic_cloud_user: boolean;
}
export interface RetryParams {
    attemptsCount: number;
    attemptDelay: number;
}
export interface GetSessionByRole {
    role: string;
    forceNewSession: boolean;
    spaceId?: string;
}
