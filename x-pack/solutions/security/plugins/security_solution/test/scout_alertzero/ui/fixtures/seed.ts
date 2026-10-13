/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Seeding helpers for the alertzero Scout UI suites.
 *
 * The canonical API-suite fixtures live in
 * `x-pack/platform/plugins/shared/agentic_investigations/test/scout_alertzero/api/fixtures/`.
 * A UI suite in a different module root cannot import across packages, so the
 * seeding calls are re-implemented here against the same internal routes. When
 * a third consumer appears, promote these to a shared package.
 *
 * All writes go through `kbnClient` against the test space; no LLM or EIS
 * connector is involved, so the "EIS connectors only" constraint is satisfied
 * vacuously.
 */
import type { KbnClient } from '@kbn/kbn-client';

const XSRF = 'scout-alertzero-e2e';

/** Headers for the internal agentic-investigations routes (numeric API version). */
const INTERNAL_HEADERS = {
  'kbn-xsrf': XSRF,
  'x-elastic-internal-origin': 'kibana',
  'elastic-api-version': '1',
};

/** Headers for the Agent Builder public conversations API (date version). */
const PUBLIC_HEADERS = {
  'kbn-xsrf': XSRF,
  'elastic-api-version': '2023-10-31',
};

const space = (spaceId: string, path: string) => `/s/${spaceId}/${path}`;

const AB_CONVERSATIONS_PATH = 'api/agent_builder/conversations';
const ESCALATIONS_PATH = 'internal/investigations/escalations';
const escalationStatusPath = (spaceId: string, id: string) =>
  space(spaceId, `${ESCALATIONS_PATH}/${id}/status`);
const escalationLinkPath = (spaceId: string, id: string) =>
  space(spaceId, `${ESCALATIONS_PATH}/${id}/_link`);

interface ConversationResponse {
  id: string;
  title?: string;
  user?: { id?: string };
}

/**
 * Creates a public investigation conversation. Returns its id and the profile
 * uid of the creating user (escalation create requires >=1 assignee uid).
 */
export const seedInvestigationWithOwner = async (
  kbnClient: KbnClient,
  spaceId: string,
  title: string
): Promise<{ id: string; ownerProfileUid: string }> => {
  const response = await kbnClient.request<ConversationResponse>({
    method: 'POST',
    path: space(spaceId, AB_CONVERSATIONS_PATH),
    headers: PUBLIC_HEADERS,
    body: {
      title,
      template_id: 'investigation',
      access_control: { access_mode: 'public' },
      metadata: { status: 'open' },
    },
  });
  const conversation = response.data;
  if (!conversation?.id || !conversation.user?.id) {
    throw new Error(
      `Setup: investigation "${title}" creation did not return id/user.id: ${JSON.stringify(
        conversation
      )}`
    );
  }
  return { id: conversation.id, ownerProfileUid: conversation.user.id };
};

export interface SeedEscalationOptions {
  linkedInvestigationId: string;
  assignees: string[];
  title?: string;
}

/** Creates an escalation linked to the given investigation. Returns its id. */
export const seedEscalation = async (
  kbnClient: KbnClient,
  spaceId: string,
  { linkedInvestigationId, assignees, title }: SeedEscalationOptions
): Promise<string> => {
  const response = await kbnClient.request<ConversationResponse>({
    method: 'POST',
    path: space(spaceId, ESCALATIONS_PATH),
    headers: INTERNAL_HEADERS,
    body: {
      linked_investigation_id: linkedInvestigationId,
      visibility: 'public',
      assignees,
      ...(title ? { title } : {}),
    },
  });
  if (!response.data?.id) {
    throw new Error(`Setup: escalation creation failed: ${JSON.stringify(response)}`);
  }
  return response.data.id;
};

/** Links another investigation to an existing escalation (append semantics). */
export const linkInvestigation = async (
  kbnClient: KbnClient,
  spaceId: string,
  escalationId: string,
  investigationId: string
) => {
  return kbnClient.request({
    method: 'POST',
    path: escalationLinkPath(spaceId, escalationId),
    headers: INTERNAL_HEADERS,
    body: { linked_investigations: [investigationId] },
  });
};

/** Sets escalation status ('open' | 'closed'). Reopening uses status 'open'. */
export const setEscalationStatus = async (
  kbnClient: KbnClient,
  spaceId: string,
  escalationId: string,
  status: 'open' | 'closed'
) => {
  return kbnClient.request({
    method: 'PUT',
    path: escalationStatusPath(spaceId, escalationId),
    headers: INTERNAL_HEADERS,
    body: { status },
  });
};

export interface EscalationsListResponse {
  pagination: { total: number; page: number; per_page: number };
  results: Array<{
    id: string;
    title: string;
    updated_at: string;
    metadata?: {
      status?: string;
      linked_investigations?: string[];
      assignees?: string[];
    };
  }>;
}

/**
 * Raw queue read — the same GET the queue page consumes. Specs that assert
 * ordering use this (plus the rendered DOM) so the assertion covers the server
 * response itself, not a client-side re-sort.
 */
export const listEscalations = async (
  kbnClient: KbnClient,
  spaceId: string,
  status: 'open' | 'closed' | 'all' = 'all'
): Promise<EscalationsListResponse> => {
  const response = await kbnClient.request<EscalationsListResponse>({
    method: 'GET',
    path: space(spaceId, `${ESCALATIONS_PATH}?status=${status}`),
    headers: INTERNAL_HEADERS,
  });
  return response.data;
};

/** Deletes conversations by id (allows 404 — already gone). */
export const deleteConversations = async (kbnClient: KbnClient, spaceId: string, ids: string[]) => {
  await Promise.all(
    ids.map((id) =>
      kbnClient
        .request({
          method: 'DELETE',
          path: space(spaceId, `${AB_CONVERSATIONS_PATH}/${id}`),
          headers: PUBLIC_HEADERS,
        })
        .catch(() => undefined)
    )
  );
};
