/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Argus Console ndjson builder.
//
// Constructing Kibana dashboard saved-objects as a single-line ndjson by hand
// is miserable: every Lens panel has deeply-escaped JSON and trivial typos
// corrupt the whole file. This script builds the panels as normal JS objects
// and then serialises them in the shape Kibana's saved-object importer
// expects. Run it once when the dashboard layout changes:
//
//   node soc-simulation/setup/dashboards/build_argus_console.js
//
// Output: soc-simulation/setup/dashboards/argus-console.ndjson
//
// Keep the dashboard pragmatic — every panel answers one of the Argus
// storytelling questions:
//   1. "Is the detection-eval vertical passing the gate?" (M2.1)
//   2. "What is the Frontier Simulator firing, and how has the corpus grown?"
//      (M2.4)
//   3. "What decisions are agents making, and at what confidence tiers?" (M2.5)
//   4. Phase 3: "Is Argus adapting — drift caught, playbooks relearned, intel
//      flowing?" — drift monitor, playbook learner, intel feed + Mythos
//      signal panels.
//
// The dashboard lives in `.soc-recommendations`-free territory on purpose —
// the SOC Command Center remains the operator cockpit; the Argus Console
// surfaces the Mythos-resilience invariants a reviewer needs to see.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const adHocDv = (title) => ({
  id: crypto.createHash('sha256').update(title).digest('hex').slice(0, 40),
  title,
  timeFieldName: '@timestamp',
});

const DV_TRACE = adHocDv('.soc-reasoning-trace');
const DV_RUNS = adHocDv('.soc-argus-eval-runs');
const DV_CORPUS = adHocDv('.soc-eval-corpus-*');
// Phase 3 data views.
const DV_RECS = adHocDv('.soc-recommendations');
const DV_INTEL = adHocDv('.soc-intel-feed');
const DV_MYTHOS = adHocDv('.soc-intel-mythos-signals');
const DV_TIERS = adHocDv('.soc-actor-trust-tiers');

const makeEsqlDv = (dv) => ({
  id: dv.id,
  title: dv.title,
  timeFieldName: '@timestamp',
  sourceFilters: [],
  type: 'esql',
  fieldFormats: {},
  runtimeFieldMap: {},
  allowNoIndex: false,
  name: dv.title,
  allowHidden: true,
});

const adHocDataViews = {
  [DV_TRACE.id]: makeEsqlDv(DV_TRACE),
  [DV_RUNS.id]: makeEsqlDv(DV_RUNS),
  [DV_CORPUS.id]: makeEsqlDv(DV_CORPUS),
  [DV_RECS.id]: makeEsqlDv(DV_RECS),
  [DV_INTEL.id]: makeEsqlDv(DV_INTEL),
  [DV_MYTHOS.id]: makeEsqlDv(DV_MYTHOS),
  [DV_TIERS.id]: makeEsqlDv(DV_TIERS),
};

// ─── Lens ESQL metric panel factory ─────────────────────────────────────────
//
// A minimal Lens configuration that renders a single numeric/string value
// computed by an ES|QL query. Kept tiny to avoid the visual-debt of a full
// visualization config — the goal is demo clarity, not polish.
const esqlMetric = ({ title, description, dv, esql, column, color }) => ({
  title,
  description,
  type: 'lens',
  version: 1,
  visualizationType: 'lnsMetric',
  references: [],
  state: {
    datasourceStates: {
      textBased: {
        layers: {
          'layer-1': {
            index: dv.id,
            query: { esql },
            columns: [
              {
                columnId: column.id,
                fieldName: column.field,
                meta: { type: column.type, esType: column.esType || column.type },
                inMetricDimension: true,
              },
            ],
            timeField: '@timestamp',
          },
        },
      },
    },
    filters: [],
    query: { esql },
    visualization: {
      layerId: 'layer-1',
      layerType: 'data',
      metricAccessor: column.id,
      color: color || '#00BFB3',
    },
    adHocDataViews: { [dv.id]: adHocDataViews[dv.id] },
  },
});

// ─── Lens ESQL datatable panel factory ──────────────────────────────────────
const esqlDatatable = ({ title, description, dv, esql, columns }) => ({
  title,
  description,
  type: 'lens',
  version: 1,
  visualizationType: 'lnsDatatable',
  references: [],
  state: {
    datasourceStates: {
      textBased: {
        layers: {
          'layer-1': {
            index: dv.id,
            query: { esql },
            columns: columns.map((c) => ({
              columnId: c.id,
              fieldName: c.field,
              meta: { type: c.type, esType: c.esType || c.type },
            })),
            timeField: '@timestamp',
          },
        },
      },
    },
    filters: [],
    query: { esql },
    visualization: {
      layerId: 'layer-1',
      layerType: 'data',
      columns: columns.map((c) => ({ columnId: c.id, isTransposed: false })),
    },
    adHocDataViews: { [dv.id]: adHocDataViews[dv.id] },
  },
});

// ─── Markdown banner ────────────────────────────────────────────────────────
const markdownPanel = (md) => ({
  title: '',
  type: 'visualization',
  params: {},
  savedVis: {
    id: '',
    title: '',
    description: '',
    type: 'markdown',
    params: { fontSize: 12, openLinksInNewTab: true, markdown: md },
    uiState: {},
    data: { aggs: [], searchSource: { query: { query: '', language: 'kuery' }, filter: [] } },
  },
});

// ─── Panels ─────────────────────────────────────────────────────────────────

const banner = markdownPanel(
  `## Argus Console — Mythos-Resilience Invariants\n\n` +
    `This dashboard surfaces the three Argus invariants that matter when you are ` +
    `facing a Mythos-tier adversary:\n\n` +
    `1. **Detection-eval gate** (M2.1) — every auto-applied rule has a fresh ` +
    `precision / recall / variant-coverage verdict that passed the gate thresholds.\n` +
    `2. **Frontier simulator cycle** (M2.4) — the labelled Mythos corpus keeps ` +
    `growing through mutation axes, so yesterday's rules are re-challenged today.\n` +
    `3. **Reasoning-trace governance** (M2.5) — every agent decision is ` +
    `attributable to an \`argus.decision.kind\` and a trust tier, so a reviewer can ` +
    `follow the chain from alert → verdict → rule change.\n\n` +
    `If the gate metrics below drop out of green, or the decision stream silences, ` +
    `something is wrong upstream — check the SOC Command Center for operational ` +
    `health.`
);

const latestPrecision = esqlMetric({
  title: 'Latest eval — precision',
  description: 'Most recent `.soc-argus-eval-runs` precision across all rules.',
  dv: DV_RUNS,
  esql:
    'FROM .soc-argus-eval-runs | WHERE run_kind == "detection" | SORT @timestamp DESC | LIMIT 20 ' +
    '| STATS precision = AVG(scores.precision)',
  column: { id: 'precision', field: 'precision', type: 'number' },
  color: '#01B075',
});

const latestRecall = esqlMetric({
  title: 'Latest eval — recall',
  description: 'Most recent `.soc-argus-eval-runs` recall across all rules.',
  dv: DV_RUNS,
  esql:
    'FROM .soc-argus-eval-runs | WHERE run_kind == "detection" | SORT @timestamp DESC | LIMIT 20 ' +
    '| STATS recall = AVG(scores.recall)',
  column: { id: 'recall', field: 'recall', type: 'number' },
  color: '#00BFB3',
});

const latestVariantCoverage = esqlMetric({
  title: 'Variant coverage',
  description: 'Fraction of labelled positive variant axes fired by at least one rule.',
  dv: DV_RUNS,
  esql:
    'FROM .soc-argus-eval-runs | WHERE run_kind == "detection" | SORT @timestamp DESC | LIMIT 20 ' +
    '| STATS variant_coverage = AVG(scores.variant_coverage)',
  column: { id: 'variant_coverage', field: 'variant_coverage', type: 'number' },
  color: '#F583B7',
});

const passRate = esqlMetric({
  title: 'Gate pass-rate (24h)',
  description: 'Share of the last 24h of eval runs that passed the gate.',
  dv: DV_RUNS,
  esql:
    'FROM .soc-argus-eval-runs ' +
    '| WHERE run_kind == "detection" AND @timestamp > NOW() - 24 HOURS ' +
    '| EVAL is_pass = CASE(gate_decision == "pass", 1.0, 0.0) ' +
    '| STATS pass_rate = AVG(is_pass)',
  column: { id: 'pass_rate', field: 'pass_rate', type: 'number' },
  color: '#01B075',
});

const evalRunsTable = esqlDatatable({
  title: 'Recent detection-eval runs',
  description: 'One row per (rule, run). Read top-to-bottom to watch the gate evolve.',
  dv: DV_RUNS,
  esql:
    'FROM .soc-argus-eval-runs | WHERE run_kind == "detection" | SORT @timestamp DESC | LIMIT 20 ' +
    '| KEEP @timestamp, rule_id, gate_decision, scores.precision, scores.recall, scores.variant_coverage',
  columns: [
    { id: '@timestamp', field: '@timestamp', type: 'date' },
    { id: 'rule_id', field: 'rule_id', type: 'string', esType: 'keyword' },
    { id: 'gate_decision', field: 'gate_decision', type: 'string', esType: 'keyword' },
    { id: 'scores.precision', field: 'scores.precision', type: 'number' },
    { id: 'scores.recall', field: 'scores.recall', type: 'number' },
    { id: 'scores.variant_coverage', field: 'scores.variant_coverage', type: 'number' },
  ],
});

const decisionsByKind = esqlDatatable({
  title: 'Argus decisions — last 24h by kind',
  description: 'Counts by `argus.decision.kind`. Surfaces the share of auto vs. gated decisions.',
  dv: DV_TRACE,
  esql:
    'FROM .soc-reasoning-trace ' +
    '| WHERE @timestamp > NOW() - 24 HOURS ' +
    '| STATS count = COUNT(*) BY kind = argus.decision.kind ' +
    '| SORT count DESC',
  columns: [
    { id: 'kind', field: 'kind', type: 'string', esType: 'keyword' },
    { id: 'count', field: 'count', type: 'number' },
  ],
});

const lowConfidenceDecisions = esqlDatatable({
  title: 'Low-confidence decisions (<0.5)',
  description:
    'Recent Argus decisions where the agent self-reported confidence below 0.5. Review for ' +
    'human-in-the-loop intervention.',
  dv: DV_TRACE,
  esql:
    'FROM .soc-reasoning-trace ' +
    '| WHERE argus.decision.confidence < 0.5 ' +
    '| SORT @timestamp DESC ' +
    '| LIMIT 20 ' +
    '| KEEP @timestamp, agent_id, argus.decision.kind, argus.decision.confidence, argus.actor.trust_tier',
  columns: [
    { id: '@timestamp', field: '@timestamp', type: 'date' },
    { id: 'agent_id', field: 'agent_id', type: 'string', esType: 'keyword' },
    { id: 'argus.decision.kind', field: 'argus.decision.kind', type: 'string', esType: 'keyword' },
    {
      id: 'argus.decision.confidence',
      field: 'argus.decision.confidence',
      type: 'number',
    },
    {
      id: 'argus.actor.trust_tier',
      field: 'argus.actor.trust_tier',
      type: 'string',
      esType: 'keyword',
    },
  ],
});

const corpusSize = esqlMetric({
  title: 'Labelled corpus size',
  description:
    'Total documents across `.soc-eval-corpus-*`. Should grow as the frontier simulator runs.',
  dv: DV_CORPUS,
  esql: 'FROM .soc-eval-corpus-* | STATS corpus_size = COUNT(*)',
  column: { id: 'corpus_size', field: 'corpus_size', type: 'number' },
  color: '#54B399',
});

const corpusByPrimitive = esqlDatatable({
  title: 'Corpus size by MITRE primitive',
  description:
    'Distribution of labelled corpus events across MITRE primitives. A healthy ' +
    'frontier simulator keeps all three primitives growing in parallel.',
  dv: DV_CORPUS,
  esql:
    'FROM .soc-eval-corpus-* ' +
    '| STATS size = COUNT(*) BY primitive = _argus.primitive_id ' +
    '| SORT size DESC',
  columns: [
    { id: 'primitive', field: 'primitive', type: 'string', esType: 'keyword' },
    { id: 'size', field: 'size', type: 'number' },
  ],
});

// ─── Phase 3 panels — drift, playbook, intel, mythos ────────────────────────
//
// Each Phase 3 initiative answers a question the Mythos-era operator needs:
//   * Drift monitor   — "Is any rule's precision decaying under adversary mutation?"
//   * Playbook learner — "Are any (technique, step) pairs under-performing?"
//   * Intel feed      — "Are we ingesting fresh Mythos-era intel, or is the feed dark?"
//   * Mythos signals  — "Which CVEs carry the strongest Mythos-era pressure right now?"

const phase3Banner = markdownPanel(
  `## Phase 3 — Adaptive Argus\n\n` +
    `Argus is no longer a static detector. The panels below show the three ` +
    `adaptive loops keeping Argus ahead of a Mythos-tier adversary:\n\n` +
    `1. **Drift detection** (\`soc-argus-drift-monitor\`) — rule precision and actor ` +
    `trust drift emit \`mutation_intent\` recommendations for re-evaluation.\n` +
    `2. **Playbook learning** (\`soc-argus-playbook-learner\`) — (technique, step) ` +
    `pairs that underperform get remapped to safer candidates.\n` +
    `3. **Intel ingestion** (\`soc-argus-intel-adapter-generic\` + ` +
    `\`soc-argus-intel-mythos-aggregator\`) — Mythos-era feeds feed the ` +
    `per-CVE \`mythos_signal\` used by exploit-probability scoring.\n`
);

const driftIntentsCount = esqlMetric({
  title: 'Drift intents (24h)',
  description:
    'Count of `mutation_intent` recs emitted by `soc-argus-drift-monitor` in the last 24h.',
  dv: DV_RECS,
  esql:
    'FROM .soc-recommendations ' +
    '| WHERE @timestamp > NOW() - 24 HOURS ' +
    '| WHERE source == "soc-argus-drift-monitor" ' +
    '| STATS drift_intents = COUNT(*)',
  column: { id: 'drift_intents', field: 'drift_intents', type: 'number' },
  color: '#F583B7',
});

const playbookRemapCount = esqlMetric({
  title: 'Playbook remap intents (24h)',
  description:
    'Count of `mutation_intent` recs emitted by `soc-argus-playbook-learner` in the last 24h.',
  dv: DV_RECS,
  esql:
    'FROM .soc-recommendations ' +
    '| WHERE @timestamp > NOW() - 24 HOURS ' +
    '| WHERE source == "soc-argus-playbook-learner" ' +
    '| STATS remap_intents = COUNT(*)',
  column: { id: 'remap_intents', field: 'remap_intents', type: 'number' },
  color: '#FEC514',
});

const intelRowsCount = esqlMetric({
  title: 'Intel rows (14d)',
  description:
    'Documents in `.soc-intel-feed` within the 14d aggregation window. Stalls indicate a dark feed.',
  dv: DV_INTEL,
  esql:
    'FROM .soc-intel-feed ' +
    '| WHERE @timestamp > NOW() - 14 DAYS ' +
    '| STATS intel_rows = COUNT(*)',
  column: { id: 'intel_rows', field: 'intel_rows', type: 'number' },
  color: '#00BFB3',
});

const topCveMythos = esqlDatatable({
  title: 'Top CVEs by Mythos signal',
  description:
    'Per-CVE `mythos_signal` as aggregated from `.soc-intel-feed`. Feeds into the M2.3 ' +
    'exploit-probability score for alerts tagged with the same CVE.',
  dv: DV_MYTHOS,
  esql:
    'FROM .soc-intel-mythos-signals ' +
    '| SORT mythos_signal DESC, @timestamp DESC ' +
    '| LIMIT 10 ' +
    '| KEEP cve_id, mythos_signal, evidence_count, computed_at',
  columns: [
    { id: 'cve_id', field: 'cve_id', type: 'string', esType: 'keyword' },
    { id: 'mythos_signal', field: 'mythos_signal', type: 'number' },
    { id: 'evidence_count', field: 'evidence_count', type: 'number' },
    { id: 'computed_at', field: 'computed_at', type: 'date' },
  ],
});

const recentDriftIntents = esqlDatatable({
  title: 'Recent drift & playbook mutation intents',
  description:
    'Latest adaptive-loop `mutation_intent` recs awaiting re-evaluation. Click through to ' +
    '`.soc-recommendations` in Discover for the full envelope.',
  dv: DV_RECS,
  esql:
    'FROM .soc-recommendations ' +
    '| WHERE source IN ("soc-argus-drift-monitor", "soc-argus-playbook-learner") ' +
    '| SORT @timestamp DESC ' +
    '| LIMIT 20 ' +
    '| KEEP @timestamp, source, title, status',
  columns: [
    { id: '@timestamp', field: '@timestamp', type: 'date' },
    { id: 'source', field: 'source', type: 'string', esType: 'keyword' },
    { id: 'title', field: 'title', type: 'string', esType: 'keyword' },
    { id: 'status', field: 'status', type: 'string', esType: 'keyword' },
  ],
});

const actorTierDistribution = esqlDatatable({
  title: 'Actor trust-tier distribution',
  description:
    'Count of Argus actors per trust tier (from `.soc-actor-trust-tiers`). Frontier-tier ' +
    'actors are the only ones whose outcomes feed the playbook learner.',
  dv: DV_TIERS,
  esql:
    'FROM .soc-actor-trust-tiers ' + '| STATS actors = COUNT(*) BY tier ' + '| SORT actors DESC',
  columns: [
    { id: 'tier', field: 'tier', type: 'string', esType: 'keyword' },
    { id: 'actors', field: 'actors', type: 'number' },
  ],
});

// ─── Grid layout ────────────────────────────────────────────────────────────
//
// Kibana dashboard grid is 48 columns wide. Each panel carries gridData:
// {x, y, w, h, i}. Laid out as a readable three-row board.

const toPanel = (embeddable, { i, x, y, w, h }) => {
  if (embeddable.type === 'visualization') {
    return {
      type: 'visualization',
      gridData: { x, y, w, h, i },
      panelIndex: i,
      embeddableConfig: {
        enhancements: {},
        savedVis: embeddable.savedVis,
      },
    };
  }
  return {
    type: 'lens',
    gridData: { x, y, w, h, i },
    panelIndex: i,
    embeddableConfig: {
      enhancements: {},
      disabledActions: ['OPEN_FLYOUT_ADD_DRILLDOWN'],
      attributes: {
        title: embeddable.title,
        description: embeddable.description,
        type: 'lens',
        version: embeddable.version,
        visualizationType: embeddable.visualizationType,
        references: embeddable.references,
        state: embeddable.state,
      },
    },
  };
};

const panels = [
  toPanel(banner, { i: 'argus-banner', x: 0, y: 0, w: 48, h: 5 }),

  toPanel(latestPrecision, { i: 'argus-precision', x: 0, y: 5, w: 12, h: 6 }),
  toPanel(latestRecall, { i: 'argus-recall', x: 12, y: 5, w: 12, h: 6 }),
  toPanel(latestVariantCoverage, { i: 'argus-variant-coverage', x: 24, y: 5, w: 12, h: 6 }),
  toPanel(passRate, { i: 'argus-pass-rate', x: 36, y: 5, w: 12, h: 6 }),

  toPanel(evalRunsTable, { i: 'argus-eval-runs-table', x: 0, y: 11, w: 30, h: 12 }),
  toPanel(decisionsByKind, { i: 'argus-decisions-by-kind', x: 30, y: 11, w: 18, h: 12 }),

  toPanel(lowConfidenceDecisions, { i: 'argus-low-confidence', x: 0, y: 23, w: 30, h: 12 }),
  toPanel(corpusSize, { i: 'argus-corpus-size', x: 30, y: 23, w: 18, h: 6 }),
  toPanel(corpusByPrimitive, { i: 'argus-corpus-primitive', x: 30, y: 29, w: 18, h: 6 }),

  // Phase 3: adaptive Argus.
  toPanel(phase3Banner, { i: 'argus-phase3-banner', x: 0, y: 35, w: 48, h: 5 }),
  toPanel(driftIntentsCount, { i: 'argus-drift-count', x: 0, y: 40, w: 16, h: 6 }),
  toPanel(playbookRemapCount, { i: 'argus-playbook-remap', x: 16, y: 40, w: 16, h: 6 }),
  toPanel(intelRowsCount, { i: 'argus-intel-rows', x: 32, y: 40, w: 16, h: 6 }),
  toPanel(topCveMythos, { i: 'argus-top-mythos', x: 0, y: 46, w: 24, h: 12 }),
  toPanel(recentDriftIntents, { i: 'argus-recent-intents', x: 24, y: 46, w: 24, h: 12 }),
  toPanel(actorTierDistribution, { i: 'argus-tier-dist', x: 0, y: 58, w: 24, h: 8 }),
];

// ─── Dashboard saved object ────────────────────────────────────────────────

const dashboard = {
  id: 'argus-console',
  type: 'dashboard',
  typeMigrationVersion: '10.3.0',
  coreMigrationVersion: '8.8.0',
  managed: false,
  attributes: {
    title: 'Argus Console — Mythos-Resilience Invariants',
    description:
      'Argus operator cockpit: detection-eval gate (M2.1), frontier simulator cycle (M2.4), ' +
      'reasoning-trace governance (M2.5), plus the Phase 3 adaptive loops (drift detection, ' +
      'playbook learning, intel ingestion, per-CVE Mythos signal). Read alongside the ' +
      'SOC Command Center.',
    timeRestore: true,
    timeTo: 'now',
    timeFrom: 'now-24h',
    refreshInterval: { pause: false, value: 15000 },
    panelsJSON: JSON.stringify(panels),
    optionsJSON: JSON.stringify({ hidePanelTitles: false, useMargins: true, syncColors: false }),
    kibanaSavedObjectMeta: {
      searchSourceJSON: JSON.stringify({ query: { query: '', language: 'kuery' }, filter: [] }),
    },
    version: 1,
  },
  references: [],
};

const outPath = path.join(__dirname, 'argus-console.ndjson');
fs.writeFileSync(outPath, JSON.stringify(dashboard) + '\n');
// eslint-disable-next-line no-console
console.log('wrote', outPath);
