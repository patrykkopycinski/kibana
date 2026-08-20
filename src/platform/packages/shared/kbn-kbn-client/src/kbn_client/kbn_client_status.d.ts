/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KbnClientRequester } from './kbn_client_requester';
interface Status {
  level: 'available' | 'degraded' | 'unavailable' | 'critical';
  summary: string;
  detail?: string;
  documentationUrl?: string;
  meta?: Record<string, unknown>;
}
interface ApiResponseStatus {
  name: string;
  uuid: string;
  version: {
    number: string;
    build_hash: string;
    build_number: number;
    build_snapshot: boolean;
  };
  status: {
    overall: Status;
    core: Record<string, Status>;
    plugins: Record<string, Status>;
  };
  metrics: unknown;
}
export declare class KbnClientStatus {
  private readonly requester;
  constructor(requester: KbnClientRequester);
  /**
   * Get the full server status
   */
  get(): Promise<ApiResponseStatus>;
  /**
   * Get the overall/merged state
   */
  getOverallState(): Promise<'available' | 'critical' | 'degraded' | 'unavailable'>;
}
export {};
