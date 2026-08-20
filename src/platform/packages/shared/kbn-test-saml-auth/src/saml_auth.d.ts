/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { Cookie } from 'tough-cookie';
import type {
  CloudSamlSessionParams,
  CreateSamlSessionParams,
  LocalSamlSessionParams,
  RetryParams,
  SAMLCallbackParams,
  SAMLResponseValueParams,
  UserProfile,
} from './types';
export declare class Session {
  readonly cookie: Cookie;
  readonly email: string;
  constructor(cookie: Cookie, email: string);
  getCookieValue(): string;
}
export declare const createCloudSession: (
  params: CreateSamlSessionParams,
  retryParams?: RetryParams
) => Promise<string>;
export declare const createSAMLRequest: (
  kbnUrl: string,
  kbnVersion: string,
  log: ToolingLog
) => Promise<{
  location: string;
  sid: string;
}>;
export declare const createSAMLResponse: (params: SAMLResponseValueParams) => Promise<string>;
export declare const finishSAMLHandshake: ({
  kbnHost,
  samlResponse,
  sid,
  log,
  maxRetryCount,
}: SAMLCallbackParams) => Promise<Cookie>;
export declare const getSecurityProfile: ({
  kbnHost,
  cookie,
  log,
}: {
  kbnHost: string;
  cookie: Cookie;
  log: ToolingLog;
}) => Promise<UserProfile>;
export declare const createCloudSAMLSession: (params: CloudSamlSessionParams) => Promise<Session>;
export declare const createLocalSAMLSession: (params: LocalSamlSessionParams) => Promise<Session>;
