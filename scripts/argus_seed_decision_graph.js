#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Seed `.soc-decision-graph` with realistic edges linking the demo subjects
 * that already live in other `.soc-*` indices.
 *
 * The decision-graph edges form a small neighborhood around three canonical
 * CVE advisories so that the Console flyout and the full-screen explorer have
 * something to render when an operator picks a reasoning step or a CVE from
 * the activity feed. Every edge has a deterministic `edge_id` so re-running
 * this script is idempotent (the bulk op uses `create` against a data stream
 * which rejects duplicates; we clear first by `source=argus.demo-seed`).
 *
 * Usage:
 *   ES_URL=http://localhost:19200 ES_AUTH=elastic:changeme \
 *     node scripts/argus_seed_decision_graph.js
 */

const DEFAULT_ES_URL = 'http://localhost:19200';
const DEFAULT_ES_AUTH = 'elastic:changeme';

const ES_URL = process.env.ES_URL || DEFAULT_ES_URL;
const ES_AUTH = process.env.ES_AUTH || DEFAULT_ES_AUTH;

const INDEX = '.soc-decision-graph';
const SOURCE_TAG = 'argus.demo-seed';

const basicAuth = `Basic ${Buffer.from(ES_AUTH).toString('base64')}`;

// Build a neighborhood per canonical CVE:
//   advisory → intent → outcome/rule
//                    → reasoning → audit
//                    ← technique ← actor
//
// Labels are intentionally short so the SVG renderer can show them without
// wrapping; ids match the ones seeded by argus_seed_coverage.js /
// seed_argus_demo.sh where they overlap.
const NEIGHBORHOODS = [
  {
    cve: 'CVE-2024-27198',
    intent: 'mut-intent-cve-2024-27198',
    rule: 'rule-jetbrains-teamcity-auth-bypass',
    outcome: 'outcome-cve-2024-27198',
    outcomeVerdict: 'applied',
    reasoning: 'run-synth-cve-2024-27198',
    audit: 'audit-apply-rule-jetbrains-teamcity-auth-bypass',
    techniques: ['T1190', 'T1078'],
    actors: ['threat-actor-lazarus'],
    observations: [
      { id: 'obs-teamcity-auth-bypass-exploit-attempts', label: 'exploit attempts' },
      { id: 'obs-teamcity-post-apply-hits', label: 'post-apply hits' },
    ],
  },
  {
    cve: 'CVE-2024-3400',
    intent: 'mut-intent-cve-2024-3400',
    rule: 'rule-paloalto-globalprotect-cmdi',
    outcome: 'outcome-cve-2024-3400',
    outcomeVerdict: 'applied',
    reasoning: 'run-synth-cve-2024-3400',
    audit: 'audit-apply-rule-paloalto-globalprotect-cmdi',
    techniques: ['T1190', 'T1059.004'],
    actors: ['threat-actor-apt28'],
    observations: [
      { id: 'obs-globalprotect-cmdi-live-hits', label: 'live hits 24h' },
      { id: 'obs-globalprotect-drift-detected', label: 'drift signal' },
    ],
  },
  {
    cve: 'CVE-2024-21412',
    intent: 'mut-intent-cve-2024-21412',
    rule: 'rule-smartscreen-bypass-internet-shortcut',
    outcome: 'outcome-cve-2024-21412',
    outcomeVerdict: 'rolled_back',
    reasoning: 'run-synth-cve-2024-21412',
    audit: 'audit-apply-rule-smartscreen-bypass-internet-shortcut',
    techniques: ['T1211', 'T1566.001'],
    actors: ['threat-actor-finseven'],
    observations: [
      { id: 'obs-smartscreen-false-positive-spike', label: 'false-positive spike' },
      { id: 'obs-smartscreen-rollback-evidence', label: 'rollback evidence' },
    ],
  },
];

const now = Date.now();
const minutes = (m) => new Date(now - m * 60 * 1000).toISOString();

const edges = [];
NEIGHBORHOODS.forEach((n, idx) => {
  const base = idx * 60;
  const ts = (offset) => minutes(base + offset);

  // advisory -> intent
  edges.push({
    edge_id: `edge-${n.cve}-advisory-intent`,
    relation: 'advisory_to_intent',
    from: { kind: 'advisory', id: n.cve, label: n.cve },
    to: { kind: 'intent', id: n.intent, label: n.intent.replace(/^mut-intent-/, '') },
    strength: 0.92,
    evidence_ts: ts(50),
    provenance: { source_index: '.soc-mutation-intents', source_doc_id: n.intent },
  });

  // intent -> rule
  edges.push({
    edge_id: `edge-${n.cve}-intent-rule`,
    relation: 'intent_produces_rule',
    from: { kind: 'intent', id: n.intent, label: n.intent.replace(/^mut-intent-/, '') },
    to: { kind: 'rule', id: n.rule, label: n.rule.replace(/^rule-/, '') },
    strength: 0.88,
    evidence_ts: ts(40),
    provenance: { source_index: '.soc-recommendations', source_doc_id: n.rule },
  });

  // intent -> outcome
  edges.push({
    edge_id: `edge-${n.cve}-intent-outcome`,
    relation: 'intent_to_outcome',
    from: { kind: 'intent', id: n.intent, label: n.intent.replace(/^mut-intent-/, '') },
    to: { kind: 'outcome', id: n.outcome, label: n.outcomeVerdict },
    strength: 0.95,
    evidence_ts: ts(30),
    provenance: { source_index: '.soc-outcomes', source_doc_id: n.outcome },
  });

  // reasoning -> intent (reasoning supports the intent)
  edges.push({
    edge_id: `edge-${n.cve}-reasoning-intent`,
    relation: 'reasoning_supports_intent',
    from: { kind: 'reasoning', id: n.reasoning, label: n.reasoning.replace(/^run-/, '') },
    to: { kind: 'intent', id: n.intent, label: n.intent.replace(/^mut-intent-/, '') },
    strength: 0.9,
    evidence_ts: ts(45),
    provenance: { source_index: '.soc-reasoning-trace', source_doc_id: n.reasoning },
  });

  // audit -> outcome (audit trail for the apply)
  edges.push({
    edge_id: `edge-${n.cve}-audit-outcome`,
    relation: 'audit_records_outcome',
    from: { kind: 'audit', id: n.audit, label: 'apply' },
    to: { kind: 'outcome', id: n.outcome, label: n.outcomeVerdict },
    evidence_ts: ts(25),
    provenance: { source_index: '.soc-audit-trail', source_doc_id: n.audit },
  });

  // observations -> outcome (post-apply observer evidence the outcome gate
  // used to verdict the intent). This gives the explorer a reason to render
  // `observation` nodes which otherwise wouldn't appear in the graph.
  n.observations.forEach((obs, obsIdx) => {
    edges.push({
      edge_id: `edge-${n.cve}-observation-${obsIdx}-to-outcome`,
      relation: 'observation_supports_outcome',
      from: { kind: 'observation', id: obs.id, label: obs.label },
      to: { kind: 'outcome', id: n.outcome, label: n.outcomeVerdict },
      strength: obsIdx === 0 ? 0.78 : 0.52,
      evidence_ts: ts(22 - obsIdx * 2),
      provenance: { source_index: '.soc-observations', source_doc_id: obs.id },
    });
    // observation -> rule (observer watched the rule that produced hits)
    edges.push({
      edge_id: `edge-${n.cve}-observation-${obsIdx}-to-rule`,
      relation: 'observation_of_rule',
      from: { kind: 'observation', id: obs.id, label: obs.label },
      to: { kind: 'rule', id: n.rule, label: n.rule.replace(/^rule-/, '') },
      strength: 0.6,
      evidence_ts: ts(21 - obsIdx * 2),
      provenance: { source_index: '.soc-observations', source_doc_id: obs.id },
    });
  });

  // techniques -> rule (rule covers techniques)
  n.techniques.forEach((techId, techIdx) => {
    edges.push({
      edge_id: `edge-${n.cve}-rule-covers-${techId}`,
      relation: 'rule_covers_technique',
      from: { kind: 'rule', id: n.rule, label: n.rule.replace(/^rule-/, '') },
      to: { kind: 'technique', id: techId, label: techId },
      strength: techIdx === 0 ? 0.85 : 0.6,
      evidence_ts: ts(35),
      provenance: { source_index: '.soc-recommendations', source_doc_id: n.rule },
    });
  });

  // actors -> techniques (actor uses technique)
  n.actors.forEach((actorId) => {
    n.techniques.forEach((techId) => {
      edges.push({
        edge_id: `edge-${actorId}-uses-${techId}`,
        relation: 'actor_uses_technique',
        from: {
          kind: 'actor',
          id: actorId,
          label: actorId.replace(/^threat-actor-/, ''),
        },
        to: { kind: 'technique', id: techId, label: techId },
        strength: 0.75,
        evidence_ts: ts(20),
        provenance: { source_index: '.soc-threat-actors', source_doc_id: actorId },
      });
    });
  });
});

// Cross-neighborhood edges so the explorer can show shared techniques being
// pulled in by multiple CVEs — this is what makes the graph view genuinely
// richer than a single flyout.
edges.push({
  edge_id: 'edge-advisory-cluster-T1190-27198',
  relation: 'technique_shared_by_advisories',
  from: { kind: 'technique', id: 'T1190', label: 'T1190' },
  to: { kind: 'advisory', id: 'CVE-2024-27198', label: 'CVE-2024-27198' },
  strength: 0.5,
  evidence_ts: minutes(10),
  provenance: { source_index: '.soc-cve-advisories', source_doc_id: 'CVE-2024-27198' },
});
edges.push({
  edge_id: 'edge-advisory-cluster-T1190-3400',
  relation: 'technique_shared_by_advisories',
  from: { kind: 'technique', id: 'T1190', label: 'T1190' },
  to: { kind: 'advisory', id: 'CVE-2024-3400', label: 'CVE-2024-3400' },
  strength: 0.55,
  evidence_ts: minutes(9),
  provenance: { source_index: '.soc-cve-advisories', source_doc_id: 'CVE-2024-3400' },
});

// Actor co-occurrence — two actors sharing T1190 gives the actor-kind drill
// a cluster worth exploring.
edges.push({
  edge_id: 'edge-lazarus-apt28-shared-T1190',
  relation: 'actors_share_technique',
  from: { kind: 'actor', id: 'threat-actor-lazarus', label: 'lazarus' },
  to: { kind: 'technique', id: 'T1190', label: 'T1190' },
  strength: 0.7,
  evidence_ts: minutes(8),
  provenance: { source_index: '.soc-threat-actors', source_doc_id: 'threat-actor-lazarus' },
});

// Governance-blocked path: an intent that never became an outcome because the
// autonomy gate rejected it. Drives the "blocked" story in the explorer.
const BLOCKED_INTENT = 'mut-intent-cve-2024-99999-blocked';
edges.push({
  edge_id: 'edge-blocked-advisory-intent',
  relation: 'advisory_to_intent',
  from: { kind: 'advisory', id: 'CVE-2024-99999', label: 'CVE-2024-99999' },
  to: { kind: 'intent', id: BLOCKED_INTENT, label: 'cve-2024-99999-blocked' },
  strength: 0.88,
  evidence_ts: minutes(7),
  provenance: { source_index: '.soc-mutation-intents', source_doc_id: BLOCKED_INTENT },
});
edges.push({
  edge_id: 'edge-blocked-intent-outcome',
  relation: 'intent_to_outcome',
  from: { kind: 'intent', id: BLOCKED_INTENT, label: 'cve-2024-99999-blocked' },
  to: { kind: 'outcome', id: 'outcome-cve-2024-99999-blocked', label: 'blocked' },
  strength: 0.95,
  evidence_ts: minutes(6),
  provenance: {
    source_index: '.soc-outcomes',
    source_doc_id: 'outcome-cve-2024-99999-blocked',
  },
});
edges.push({
  edge_id: 'edge-blocked-audit-outcome',
  relation: 'audit_records_outcome',
  from: {
    kind: 'audit',
    id: 'audit-governance-block-cve-2024-99999',
    label: 'gov block',
  },
  to: { kind: 'outcome', id: 'outcome-cve-2024-99999-blocked', label: 'blocked' },
  evidence_ts: minutes(5),
  provenance: {
    source_index: '.soc-audit-trail',
    source_doc_id: 'audit-governance-block-cve-2024-99999',
  },
});
edges.push({
  edge_id: 'edge-blocked-observation-governance',
  relation: 'observation_supports_outcome',
  from: {
    kind: 'observation',
    id: 'obs-governance-veto-signal',
    label: 'operator veto',
  },
  to: { kind: 'outcome', id: 'outcome-cve-2024-99999-blocked', label: 'blocked' },
  strength: 0.92,
  evidence_ts: minutes(4),
  provenance: {
    source_index: '.soc-observations',
    source_doc_id: 'obs-governance-veto-signal',
  },
});

const esRequest = async (method, path, body, contentType = 'application/json') => {
  const url = `${ES_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': contentType,
      Authorization: basicAuth,
    },
    body: body
      ? contentType === 'application/json'
        ? JSON.stringify(body)
        : body
      : undefined,
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status} ${res.statusText}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
};

const run = async () => {
  console.log(`[argus-seed-decision-graph] seeding ${edges.length} edges to ${INDEX}`);

  // Clear previous demo-seeded edges so the run is idempotent.
  try {
    await esRequest('POST', `/${INDEX}/_delete_by_query?refresh=true`, {
      query: { term: { source: SOURCE_TAG } },
    });
  } catch (err) {
    // Index may not exist yet — the first bulk create will auto-provision it
    // via the data-stream template.
  }

  const lines = [];
  for (const edge of edges) {
    const doc = {
      '@timestamp': edge.evidence_ts,
      edge_id: edge.edge_id,
      relation: edge.relation,
      from_kind: edge.from.kind,
      from_id: edge.from.id,
      from_label: edge.from.label,
      to_kind: edge.to.kind,
      to_id: edge.to.id,
      to_label: edge.to.label,
      evidence_ts: edge.evidence_ts,
      strength: edge.strength,
      provenance: edge.provenance,
      source: SOURCE_TAG,
    };
    lines.push(JSON.stringify({ create: {} }));
    lines.push(JSON.stringify(doc));
  }
  const body = lines.join('\n') + '\n';
  const res = await fetch(`${ES_URL}/${INDEX}/_bulk?refresh=wait_for`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-ndjson',
      Authorization: basicAuth,
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`bulk index ${INDEX} failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  if (json.errors) {
    const firstError = (json.items || [])
      .map((item) => item.create?.error || item.index?.error)
      .find(Boolean);
    throw new Error(`bulk had errors: ${JSON.stringify(firstError)}`);
  }

  console.log(`[argus-seed-decision-graph] seeded ${edges.length} edges`);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
