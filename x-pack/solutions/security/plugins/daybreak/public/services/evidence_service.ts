/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpSetup } from '@kbn/core-http-browser';
import { daybreakApiPath } from '../../common/http_api';

/**
 * Evidence shape as returned by `GET /api/daybreak/evidence` (FR-023). Kept
 * as a browser-local type rather than importing from
 * `server/client/evidence/storage`'s `EvidenceProperties` to preserve the
 * public/server boundary — the HTTP response is the actual contract the
 * browser depends on. Mirrors every field except `space`, which is a
 * server-internal multi-tenancy concern (same rationale as
 * `DaybreakProposal` in `proposals_service.ts` dropping `space`).
 */
export interface DaybreakEvidence {
  id: string;
  kind: 'alert' | 'event' | 'entity' | 'timeline' | 'query' | 'assumption' | 'external';
  sourceRef?: string;
  summary: string;
  provenance: 'capability' | 'skillVersion' | 'tool';
  confidence: number;
  stance: 'for' | 'against';
  limitations?: string[];
  sensitivityLabel: 'public' | 'internal' | 'restricted';
  createdAt: string;
}

interface ListEvidenceResponse {
  results: DaybreakEvidence[];
}

/**
 * Thin HTTP client wrapping the Daybreak Evidence API (FR-012, FR-022). The
 * `ProposalInspector` (`public/application/components/proposal/proposal_inspector.tsx`)
 * renders real PD-2 worker output sourced through this service — no mocked
 * or seeded evidence data.
 */
export class EvidenceService {
  private readonly http: HttpSetup;

  constructor({ http }: { http: HttpSetup }) {
    this.http = http;
  }

  async list(): Promise<DaybreakEvidence[]> {
    const { results } = await this.http.get<ListEvidenceResponse>(`${daybreakApiPath}/evidence`);
    return results;
  }

  async get(id: string): Promise<DaybreakEvidence> {
    return this.http.get<DaybreakEvidence>(`${daybreakApiPath}/evidence/${id}`);
  }
}
