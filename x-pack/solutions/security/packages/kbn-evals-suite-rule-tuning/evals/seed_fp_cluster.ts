/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License.
 */

import type { EsClient } from '@kbn/scout';
import type { ToolingLog } from '@kbn/tooling-log';

/**
 * Seeds one detection rule plus a cluster of closed-false-positive alerts for
 * the rule-tuning worker eval. The shapes mirror what the worker's harvest
 * ES/QL query selects on:
 *
 *   kibana.alert.workflow_status == "closed"
 *   kibana.alert.workflow_reason == "false_positive"
 *   NOT MV_CONTAINS(kibana.alert.workflow_tags, "detection-watch:tuning-reviewed")
 *   grouped BY kibana.alert.rule.uuid / rule.name / rule.rule_id
 *
 * Each fixture drives the diagnose step toward one golden change_type by
 * varying the entity concentration of the FP cluster (see comments inline).
 */

export interface SeedFixtureSpec {
  id: string;
  ruleType: string;
  expected: string;
}

interface SeedContext {
  fetch: <T = unknown>(path: string, options?: Record<string, unknown>) => Promise<T>;
  esClient: EsClient;
  log: ToolingLog;
}

const ALERTS_INDEX = '.alerts-security.alerts-default';

/** Entity matrix per fixture: what the diagnose step should "see". */
const ENTITY_PROFILES: Record<
  string,
  Array<{ host: string; user: string; ip: string; process: string }>
> = {
  // Single noisy host dominates → tightest fix is an exception on host.name.
  'fp-host-exception': [
    { host: 'build-agent-01', user: 'svc_jenkins', ip: '10.0.4.11', process: 'java' },
    { host: 'build-agent-01', user: 'svc_jenkins', ip: '10.0.4.11', process: 'java' },
    { host: 'build-agent-01', user: 'svc_jenkins', ip: '10.0.4.11', process: 'java' },
    { host: 'build-agent-01', user: 'build.eng', ip: '10.0.4.11', process: 'java' },
    { host: 'build-agent-01', user: 'build.eng', ip: '10.0.4.15', process: 'node' },
  ],
  // FPs spread across many entities share one over-broad query term → narrow the query.
  // No entity (host/user/ip/process) repeats across the cluster, so a tight entity
  // exception is not a viable fix; the only signal is the match-all query itself.
  'fp-overbroad-query': [
    { host: 'web-01', user: 'www-data', ip: '10.1.0.5', process: 'nginx' },
    { host: 'api-02', user: 'svc_api', ip: '10.1.1.10', process: 'node' },
    { host: 'db-03', user: 'postgres', ip: '10.1.2.20', process: 'postgres' },
    { host: 'cache-04', user: 'redis', ip: '10.1.3.30', process: 'redis-server' },
    { host: 'worker-05', user: 'batch', ip: '10.1.4.40', process: 'python3' },
  ],
  // Same benign scanner entity repeatedly re-firing → suppression with group-by.
  'fp-volume-suppression': [
    { host: 'scan-host', user: 'svc_scanner', ip: '10.9.9.9', process: 'nmap' },
    { host: 'scan-host', user: 'svc_scanner', ip: '10.9.9.9', process: 'nmap' },
    { host: 'scan-host', user: 'svc_scanner', ip: '10.9.9.9', process: 'nmap' },
    { host: 'scan-host', user: 'svc_scanner', ip: '10.9.9.9', process: 'nmap' },
    { host: 'scan-host', user: 'svc_scanner', ip: '10.9.9.9', process: 'nmap' },
  ],
  // Real detections, uniformly low value → downgrade risk score/severity.
  'fp-low-value-risk': [
    { host: 'fleet-a', user: 'analyst1', ip: '10.2.0.1', process: 'ssh' },
    { host: 'fleet-b', user: 'analyst2', ip: '10.2.0.2', process: 'ssh' },
    { host: 'fleet-c', user: 'analyst3', ip: '10.2.0.3', process: 'ssh' },
    { host: 'fleet-d', user: 'analyst4', ip: '10.2.0.4', process: 'ssh' },
    { host: 'fleet-e', user: 'analyst5', ip: '10.2.0.5', process: 'curl' },
  ],
  // Benign everywhere, no discriminating signal at all → disable. Every entity is
  // distinct across every dimension, so no exception, suppression, or query-narrow
  // target exists; the rule itself is the problem.
  'fp-unfixable-noise': [
    { host: 'any-a', user: 'svc_health', ip: '10.3.0.1', process: 'kube-probe' },
    { host: 'any-b', user: 'svc_backup', ip: '10.3.1.2', process: 'restic' },
    { host: 'any-c', user: 'svc_metrics', ip: '10.3.2.3', process: 'node-exporter' },
    { host: 'any-d', user: 'svc_deploy', ip: '10.3.3.4', process: 'helm' },
    { host: 'any-e', user: 'svc_cron', ip: '10.3.4.5', process: 'cron' },
  ],
};

/** Query text per fixture: only the over-broad fixture is meant to be narrowed. */
const FIXTURE_QUERIES: Record<string, string> = {
  'fp-host-exception': 'process.name:java and host.os.type:linux',
  'fp-overbroad-query': 'process.name:*',
  'fp-volume-suppression': 'process.name:nmap',
  'fp-low-value-risk': 'process.name:(ssh or curl)',
  'fp-unfixable-noise': 'process.name:kube-probe',
};

const baseAlert = (ruleUuid: string, ruleName: string, ruleId: string, seq: number) => ({
  '@timestamp': new Date().toISOString(),
  'kibana.alert.rule.uuid': ruleUuid,
  'kibana.alert.rule.name': ruleName,
  'kibana.alert.rule.rule_id': ruleId,
  'kibana.alert.workflow_status': 'closed',
  'kibana.alert.workflow_reason': 'false_positive',
  'kibana.alert.workflow_tags': [],
  'kibana.alert.severity': 'medium',
  'kibana.alert.risk_score': 40,
  // NOTE: `signal.*` fields are read-only field aliases in the alerts index mapping;
  // writing them fails every bulk item with document_parsing_exception. Write the
  // concrete backing fields instead.
  'kibana.alert.reason': `eval-seed fp cluster ${seq}`,
});

export const seedRuleAndFpAlerts = async (
  { fetch, esClient, log }: SeedContext,
  fixture: SeedFixtureSpec,
  uniqueRuleId: string
): Promise<string> => {
  const ruleName = `eval rule-tuning ${fixture.id}`;
  const ruleId = `eval-rt-${fixture.id}`;

  // 0. Remove a stale rule from a previous aborted run so the create below is idempotent.
  await fetch(`/api/detection_engine/rules?spaceId=default&rule_id=${encodeURIComponent(ruleId)}`, {
    method: 'DELETE',
    headers: { 'kbn-xsrf': 'true' },
  }).catch(() => {});

  // 1. Create the detection rule via the detection engine API.
  const rule = await fetch<{ id?: string }>('/api/detection_engine/rules?spaceId=default', {
    method: 'POST',
    headers: { 'kbn-xsrf': 'true', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rule_id: ruleId,
      name: ruleName,
      type: fixture.ruleType,
      query: FIXTURE_QUERIES[fixture.id],
      language: 'kuery',
      index: ['logs-endpoint.events.process-default'],
      severity: 'medium',
      risk_score: 40,
      interval: '5m',
      from: 'now-10m',
      to: 'now',
      // The worker only diagnoses enabled rules (rule_tuning.yaml gates diagnose_rule on
      // `fetch_rule.output.enabled == true`) — a disabled rule produces no FPs, so tuning it
      // is meaningless. Seeding it disabled skipped diagnosis and yielded empty proposals.
      // Enabling is safe here: `index` has no source documents, so the rule executes and
      // matches nothing; the FP cluster is bulk-indexed directly against its uuid below.
      enabled: true,
      description: `kbn-evals rule-tuning fixture: ${fixture.id} (expected ${fixture.expected})`,
      tags: ['eval-rule-tuning'],
    }),
  });
  log.info(
    `created rule ${rule?.id ?? ruleId} (uuid key ${uniqueRuleId}) for fixture ${fixture.id}`
  );
  const seededUuid: string = rule?.id ?? uniqueRuleId;

  // 2. Index the closed-FP alert cluster against the rule's real uuid.
  const entities = ENTITY_PROFILES[fixture.id] ?? [];
  if (entities.length === 0) {
    throw new Error(`No entity profile for fixture ${fixture.id}`);
  }
  const docs = entities.map((e, i) => ({
    ...baseAlert(seededUuid, ruleName, ruleId, i),
    host: { name: e.host },
    user: { name: e.user },
    source: { ip: e.ip },
    process: { name: e.process },
  }));
  const bulkResp = await esClient.bulk({
    index: ALERTS_INDEX,
    refresh: 'wait_for',
    operations: docs.flatMap((d) => [{ index: {} }, d]),
  });
  const failed = bulkResp.items?.filter((i) => i.index?.error) ?? [];
  if (bulkResp.errors || failed.length > 0) {
    throw new Error(
      `bulk indexing failed for rule ${seededUuid}: ${JSON.stringify(
        failed[0]?.index?.error
      )?.slice(0, 500)}`
    );
  }
  log.info(`indexed ${docs.length} closed-FP alerts for rule uuid ${seededUuid}`);
  return seededUuid;
};

export const cleanupSeededArtifacts = async (
  { fetch, esClient }: { fetch: SeedContext['fetch']; esClient: EsClient },
  uniqueRuleId: string,
  fixture: SeedFixtureSpec
): Promise<void> => {
  // Alerts first (they reference the rule), then the rule itself. uniqueRuleId is the
  // seeded rule's real uuid (returned by seedRuleAndFpAlerts), not the spec's run-scoped id.
  await esClient
    .deleteByQuery({
      index: ALERTS_INDEX,
      query: { term: { 'kibana.alert.rule.uuid': uniqueRuleId } },
      refresh: true,
      conflicts: 'proceed',
    })
    .catch(() => {});
  await fetch(
    `/api/detection_engine/rules?spaceId=default&rule_id=${encodeURIComponent(
      `eval-rt-${fixture.id}`
    )}`,
    {
      method: 'DELETE',
      headers: { 'kbn-xsrf': 'true' },
    }
  ).catch(() => {});
};
