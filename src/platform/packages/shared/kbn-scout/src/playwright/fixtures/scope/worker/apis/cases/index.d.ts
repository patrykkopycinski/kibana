/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  ApiResponse,
  ApiStatusResponse,
  Attachment,
  Case,
  CaseUpdateRequest,
  CaseCreateRequest,
  CasesFindRequest,
  AttachmentRequest,
} from './types';
import type { KbnClient, ScoutLogger } from '../../../../../../common';
export interface CasesApiService {
  create: (params: CaseCreateRequest, spaceId?: string) => Promise<ApiResponse<Case>>;
  get: (caseId: string, spaceId?: string) => Promise<ApiResponse<Case>>;
  update: (params: CaseUpdateRequest[], spaceId?: string) => Promise<ApiResponse<Case[]>>;
  delete: (caseIds: string[], spaceId?: string) => Promise<ApiStatusResponse>;
  find: (params?: CasesFindRequest, spaceId?: string) => Promise<ApiResponse<Case[]>>;
  connectors: {
    get: (spaceId?: string) => Promise<ApiResponse<any>>;
  };
  comments: {
    create: (
      caseId: string,
      params: AttachmentRequest,
      spaceId?: string
    ) => Promise<ApiResponse<Case>>;
    get: (caseId: string, commentId: string, spaceId?: string) => Promise<ApiResponse<Attachment>>;
  };
  cleanup: {
    deleteAllCases: (spaceId?: string) => Promise<ApiStatusResponse>;
    deleteCasesByTags: (tags: string[], spaceId?: string) => Promise<ApiStatusResponse>;
  };
}
export declare const getCasesApiHelper: (log: ScoutLogger, kbnClient: KbnClient) => CasesApiService;
