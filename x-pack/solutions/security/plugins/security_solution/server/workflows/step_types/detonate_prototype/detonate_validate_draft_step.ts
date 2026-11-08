/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — ES|QL draft validation step, server implementation.
 *
 * The guard itself lives in `server/detonate_prototype/esql_draft_guard` so
 * the `sandbox_count` route and the re-guard sites share one implementation.
 * This step adds the workflow-shaped pieces: reading the space's default
 * indices through the workflow's own identity, injecting the trial tags and
 * schedule, and emitting the sandbox count query for the `sandbox_count`
 * route. Rejections are output (`valid: false` + `skip_reason`), never
 * exceptions — a bad draft skips the candidate, it does not fail the run.
 */

import { randomUUID } from 'crypto';

import { createServerStepDefinition } from '@kbn/workflows-extensions/server';

import { DEFAULT_INDEX_KEY, DEFAULT_INDEX_PATTERN } from '../../../../common/constants';
import {
  DETONATE_TRIAL_TAG,
  detonateCandidateTag,
  detonateTaskTag,
} from '../../../../common/detonate_prototype';
import { detonateValidateDraftStepCommonDefinition } from '../../../../common/workflows/step_types/detonate_prototype/detonate_validate_draft_step_common';
import {
  buildDetonateCountQueries,
  describeDraftQuery,
  validateDraftRuleQuery,
  validateDraftRuleShape,
} from '../../../detonate_prototype/esql_draft_guard';

/** Shipped trial schedule: a 5-minute look-back over the last 6 minutes. */
const TRIAL_INTERVAL = '5m';
const TRIAL_FROM = 'now-6m';

interface UiSettingsResponse {
  settings: Record<string, { userValue?: unknown } | undefined>;
}

/**
 * Resolve the space's default indices through the workflow's own identity:
 * user-set value when present, the registered default otherwise (the settings
 * route serves only user-provided values — same fallback `getInputIndex`
 * applies for rules).
 */
const resolveDefaultIndex = async (
  callKibanaApi: <T = unknown>(params: { method: 'GET'; path: string }) => Promise<{ body: T }>
): Promise<readonly string[]> => {
  const { body } = await callKibanaApi<UiSettingsResponse>({
    method: 'GET',
    path: '/api/kibana/settings',
  });
  const userValue = body.settings[DEFAULT_INDEX_KEY]?.userValue;
  if (
    Array.isArray(userValue) &&
    userValue.every((v) => typeof v === 'string') &&
    userValue.length > 0
  ) {
    return userValue as string[];
  }
  return DEFAULT_INDEX_PATTERN;
};

export const detonateValidateDraftStepDefinition = createServerStepDefinition({
  ...detonateValidateDraftStepCommonDefinition,
  handler: async ({ input, contextManager }) => {
    const { rule, task_id: taskId, space_id: spaceId } = input;

    const shape = validateDraftRuleShape(rule);
    if (!shape.ok) {
      return { output: { valid: false, skip_reason: shape.reason } };
    }

    const guard = validateDraftRuleQuery(
      rule.query,
      await resolveDefaultIndex(contextManager.callKibanaApi)
    );
    if (!guard.ok) {
      return { output: { valid: false, skip_reason: guard.reason } };
    }

    const candidateId = randomUUID();
    const candidateTag = detonateCandidateTag(candidateId);
    // The candidate tag is how find_created_rule finds this rule again, so a
    // drafted one (echoed from an earlier rule) must not survive.
    const candidatePrefix = detonateCandidateTag('');
    const draftedTags = rule.tags.filter((tag) => !tag.startsWith(candidatePrefix));
    const tags = [
      ...new Set([...draftedTags, DETONATE_TRIAL_TAG, detonateTaskTag(taskId), candidateTag]),
    ];

    const counts = buildDetonateCountQueries(rule.query, taskId, spaceId);
    const described = describeDraftQuery(rule.query);

    return {
      output: {
        valid: true,
        rule: { ...rule, tags, interval: TRIAL_INTERVAL, from: TRIAL_FROM },
        sandbox_query: counts.sandbox_query,
        production_query: counts.production_query,
        candidate_tag: candidateTag,
        aggregating: described.aggregating,
        source_patterns: described.source_patterns,
      },
    };
  },
});
