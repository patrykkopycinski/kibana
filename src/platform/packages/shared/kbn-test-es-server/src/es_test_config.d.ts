/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

declare class EsTestConfig {
  getVersion(): string;
  getPort(): number;
  getUrl(): string;
  getBuildFrom(): string;
  getESServerlessImage(): string | undefined;
  getTransportPort(): string;
  getUrlParts(): {
    protocol: string | undefined;
    hostname: string | null;
    port: number;
    username: string | undefined;
    password: string | undefined;
    auth: string | null;
  };
}
export declare const esTestConfig: EsTestConfig;
export {};
