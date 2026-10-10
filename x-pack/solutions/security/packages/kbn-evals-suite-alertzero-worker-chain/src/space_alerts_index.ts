/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FpTpLiveKbnRequest } from '@kbn/evals-suite-attack-discovery-fp-tp/src/world';

/**
 * G20: the alerts-as-data index of a non-default space.
 *
 * The seeder bulk-writes to `.alerts-security.alerts-<space>`. In a space whose index the
 * rule registry never installed, that write auto-creates a plain index with dynamic mappings,
 * so `kibana.alert.workflow_reason` is unmapped and `classify_alerts` fails with
 * `Unknown column [kibana.alert.workflow_reason]`. The index has to come from the rule
 * registry first. The registry installs a space's template and concrete index when a security
 * rule first runs in it, so the harness creates a disabled-after-use rule and waits for the
 * alias, then removes the rule.
 */
export const WORKFLOW_REASON_FIELD = 'kibana.alert.workflow_reason';

const DETECTION_API_VERSION = '2023-10-31';
const POLL_INTERVAL_MS = 2_000;
const INSTALL_TIMEOUT_MS = 180_000;

export const spaceAlertsAlias = (spaceId: string): string => `.alerts-security.alerts-${spaceId}`;

/** The slice of the ES client the helpers use (Scout's `esClient` satisfies it). */
export interface AlertsIndexEsClient {
  indices: {
    exists(params: { index: string }): Promise<boolean>;
    getFieldMapping(params: {
      index: string;
      fields: string;
    }): Promise<Record<string, { mappings?: Record<string, unknown> }>>;
  };
}

const sleepMs = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Throws unless the space's alerts alias exists AND maps `kibana.alert.workflow_reason`.
 * Run before example 1: a missing mapping makes every triage run fail at `classify_alerts`.
 */
export const assertAlertsIndexMapping = async (
  esClient: AlertsIndexEsClient,
  spaceId: string
): Promise<void> => {
  const alias = spaceAlertsAlias(spaceId);
  if (!(await esClient.indices.exists({ index: alias }))) {
    throw new Error(`Alerts index ${alias} does not exist for space "${spaceId}"`);
  }
  const mapping = await esClient.indices.getFieldMapping({
    index: alias,
    fields: WORKFLOW_REASON_FIELD,
  });
  const mapped = Object.values(mapping).some(
    ({ mappings }) => mappings !== undefined && Object.keys(mappings).length > 0
  );
  if (!mapped) {
    throw new Error(
      `Alerts index ${alias} has no mapping for ${WORKFLOW_REASON_FIELD}: it was auto-created ` +
        `with dynamic mappings instead of the alerts-as-data template, so classify_alerts fails`
    );
  }
};

/**
 * Makes the rule registry install the space's alerts index. Idempotent: returns at once when
 * the alias already exists. `default` is installed with Kibana and is skipped.
 */
export const ensureSpaceAlertsIndex = async ({
  kbnRequest,
  esClient,
  spaceId,
  timeoutMs = INSTALL_TIMEOUT_MS,
  sleep = sleepMs,
}: {
  /** Must address `spaceId` (see `kbnRequestFromFetch`). */
  kbnRequest: FpTpLiveKbnRequest;
  esClient: AlertsIndexEsClient;
  spaceId: string;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<void> => {
  if (spaceId === 'default') return;
  const alias = spaceAlertsAlias(spaceId);
  if (await esClient.indices.exists({ index: alias })) return;

  const created = await kbnRequest({
    method: 'POST',
    path: '/api/detection_engine/rules',
    version: DETECTION_API_VERSION,
    body: {
      type: 'query',
      name: `alertzero-eval alerts-index bootstrap (${spaceId})`,
      description: 'Makes the rule registry install the space alerts index. Deleted right after.',
      risk_score: 1,
      severity: 'low',
      index: ['alertzero-eval-bootstrap-no-such-index'],
      query: '*:*',
      language: 'kuery',
      interval: '1m',
      from: 'now-60s',
      enabled: true,
    },
  });
  const ruleId = (created.body as { id?: unknown } | undefined)?.id;
  if (created.statusCode >= 400 || typeof ruleId !== 'string') {
    throw new Error(
      `Could not create the alerts-index bootstrap rule in space "${spaceId}" (${
        created.statusCode
      }): ${JSON.stringify(created.body)}`
    );
  }

  try {
    const deadline = Date.now() + timeoutMs;
    while (!(await esClient.indices.exists({ index: alias }))) {
      if (Date.now() > deadline) {
        throw new Error(
          `The rule registry did not install ${alias} within ${timeoutMs}ms of the bootstrap rule`
        );
      }
      await sleep(POLL_INTERVAL_MS);
    }
  } finally {
    await kbnRequest({
      method: 'DELETE',
      path: `/api/detection_engine/rules?id=${encodeURIComponent(ruleId)}`,
      version: DETECTION_API_VERSION,
    });
  }
};
