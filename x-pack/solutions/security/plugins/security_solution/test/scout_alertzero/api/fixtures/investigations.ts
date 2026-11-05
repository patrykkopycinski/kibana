/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsClient } from '@kbn/scout-security';
import { ok, type AlertZeroApi } from './kbn';
import { AI_INDEX_KI_BACKING_INDEX, CONVERSATIONS_URL, PROPOSALS_URL } from './constants';
import { isRecord, listPendingProposals } from './alertzero';

export interface InvestigationProposal {
  readonly id: string;
  readonly conversationId: string;
  readonly title: string;
  readonly actionWorkflowId?: string;
  readonly actionInput?: Record<string, unknown>;
  readonly createdAt: string;
}

/**
 * Pending containment cards, optionally scoped to one investigation. `conversationId` is what
 * keeps a run's assertions on its own cards: the queue is shared across the space.
 */
export const listInvestigationProposals = async (
  api: AlertZeroApi,
  conversationId?: string
): Promise<InvestigationProposal[]> => {
  const pending = await listPendingProposals(api, {
    excludeSuperseded: true,
    ...(conversationId ? { conversationId } : {}),
  });
  return pending.flatMap((proposal) => {
    const { id, createdAt, title, actionWorkflowId, actionInput } = proposal;
    if (typeof proposal.conversationId !== 'string' || typeof title !== 'string') {
      // The queue is shared: a proposal without these fields is not an investigation card.
      return [];
    }
    return [
      {
        id,
        createdAt,
        conversationId: proposal.conversationId,
        title,
        actionWorkflowId,
        actionInput: isRecord(actionInput) ? actionInput : undefined,
      },
    ];
  });
};

/**
 * Deletes an Investigation conversation; its attachments are deleted with it. A 404 means an
 * earlier teardown already removed it, anything else non-2xx fails loudly — `api.public`
 * resolves non-2xx responses as values, so discarding the result would make teardown look
 * successful while the conversation (and its pending containment cards) survived.
 */
export const deleteInvestigation = async (api: AlertZeroApi, id: string): Promise<void> => {
  const response = await api.public('DELETE', `${CONVERSATIONS_URL}/${encodeURIComponent(id)}`);
  if (response.statusCode >= 300 && response.statusCode !== 404) {
    throw new Error(
      `Delete investigation ${id} failed: ${response.statusCode} ${JSON.stringify(response.body)}`
    );
  }
};

/**
 * Dismisses every pending proposal attached to one Investigation. The endpoint-analysis run
 * raises containment cards (isolate/collect) whose action input can carry only `endpoint_ids`
 * and a comment, so the alert- and agent-keyed run correlation cannot match them; the
 * conversation id is the one identifier every card on this Investigation shares. Dismissal —
 * not approval — releases the parked run behind each card, which then ends on its declined
 * branch while the service account still exists, so this belongs before the account teardown.
 */
export const dismissInvestigationProposals = async (
  api: AlertZeroApi,
  conversationId: string
): Promise<void> => {
  for (const proposal of await listInvestigationProposals(api, conversationId)) {
    const response = await api.internal(
      'POST',
      `${PROPOSALS_URL}/${encodeURIComponent(proposal.id)}/dismiss`,
      { body: { dismissReason: 'handled_elsewhere', rationale: 'AlertZero e2e teardown' } }
    );
    // A 409 means the card was decided concurrently (its spec approved it, or a teardown cancel
    // already ended the run behind it), which teardown accepts.
    if (response.statusCode >= 300 && response.statusCode !== 409) {
      throw new Error(
        `dismiss proposal ${proposal.id} of investigation ${conversationId} failed: ${
          response.statusCode
        } ${JSON.stringify(response.body)}`
      );
    }
  }
};

/**
 * Finds the Investigation conversations this run created, by the run-owned host/user names its
 * seed data carries (see `seedAttackScenario`). The Attack Discovery review opens one
 * Investigation per discovered attack, and only the one behind the first approved proposal is
 * captured during the run; a spec that fails between two proposals — or a review that opened an
 * extra investigation on a failed fingerprint join — otherwise leaves conversations behind that
 * point at seed data the teardown removes. The list route cannot filter by content, so this
 * pages every conversation of the space and matches each one's serialized fields against the
 * run's entity names: names minted per run are a precise key, and a conversation of another run
 * (or a user's own) never contains them. Public conversations only — a workflow's own
 * Investigation is created public so the gate can read it back.
 */
export const discoverRunInvestigations = async (
  api: AlertZeroApi,
  entityNames: readonly string[]
): Promise<string[]> => {
  if (entityNames.length === 0) {
    return [];
  }
  const CONVERSATIONS_PAGE_SIZE = 100;
  const ids: string[] = [];
  for (let page = 1; ; page++) {
    const response = ok(
      await api.public<{ results?: Array<{ id: string }>; pagination?: { total?: number } }>(
        'GET',
        `${CONVERSATIONS_URL}?page=${page}&per_page=${CONVERSATIONS_PAGE_SIZE}`
      ),
      `list investigations page ${page}`
    );
    const results = response.results ?? [];
    for (const conversation of results) {
      const detail = await api.public(
        `GET`,
        `${CONVERSATIONS_URL}/${encodeURIComponent(conversation.id)}`
      );
      if (detail.statusCode === 200) {
        if (entityNames.some((name) => JSON.stringify(detail.body).includes(name))) {
          ids.push(conversation.id);
        }
      }
      // Deleted between the list and the read: nothing to discover, and not an error.
    }
    const total = response.pagination?.total ?? 0;
    if (page * CONVERSATIONS_PAGE_SIZE >= total) {
      return ids;
    }
  }
};

/**
 * Removes exactly the indicators this run wrote. Matches the indicator's own `id` as well as the
 * document id: a seeded indicator is indexed under its id, but `context-engine.createKi` lets
 * Elasticsearch generate the document id and stores the indicator id only in `_source.id`.
 */
export const cleanupKnowledgeIndicators = async (
  esClient: EsClient,
  kiIds: readonly string[]
): Promise<void> => {
  if (kiIds.length === 0) {
    return;
  }
  await esClient
    .deleteByQuery({
      index: AI_INDEX_KI_BACKING_INDEX,
      conflicts: 'proceed',
      refresh: true,
      query: {
        bool: {
          should: [{ ids: { values: [...kiIds] } }, { terms: { id: [...kiIds] } }],
          minimum_should_match: 1,
        },
      },
    })
    .catch((error: { statusCode?: number }) => {
      if (error.statusCode !== 404) {
        throw error;
      }
    });
};
