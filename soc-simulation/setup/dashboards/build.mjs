/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Dashboard builder for the "Argus Command Center".
 *
 * Regenerates soc-command-center.ndjson in this directory.
 *
 * Node-native (no Python, no third-party deps) — kept beside the NDJSON so
 * humans can evolve the dashboard without hand-editing a single minified line.
 *
 * Usage: node build.mjs
 */

import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'soc-command-center.ndjson');

// ─── Helpers ──────────────────────────────────────────────────────────────
const dvId = (index) => createHash('sha256').update(index).digest('hex').slice(0, 64);

const adHocDV = (index, name = index) => ({
  id: dvId(index),
  title: index,
  timeFieldName: '@timestamp',
  sourceFilters: [],
  type: 'esql',
  fieldFormats: {},
  runtimeFieldMap: {},
  allowNoIndex: false,
  name,
  allowHidden: true,
});

const textBased = (index, esql, columns) => ({
  layers: {
    'layer-1': {
      index: dvId(index),
      query: { esql },
      columns,
      timeField: '@timestamp',
    },
  },
  indexPatternRefs: [
    {
      id: dvId(index),
      title: index,
      timeField: '@timestamp',
    },
  ],
});

// ─── Panel factories ──────────────────────────────────────────────────────
/**
 * Lens metric panel (big number).
 */
function metricPanel({
  id,
  title,
  description = '',
  index,
  esql,
  metricField,
  metricType = 'number',
  esType = 'long',
  color,
  subtitle,
  grid,
}) {
  return {
    type: 'lens',
    gridData: { ...grid, i: id },
    panelIndex: id,
    embeddableConfig: {
      enhancements: {},
      disabledActions: ['OPEN_FLYOUT_ADD_DRILLDOWN'],
      attributes: {
        title,
        description,
        type: 'lens',
        version: 1,
        visualizationType: 'lnsMetric',
        references: [],
        state: {
          datasourceStates: {
            textBased: textBased(index, esql, [
              {
                columnId: metricField,
                fieldName: metricField,
                meta: { type: metricType, esType },
                inMetricDimension: true,
              },
            ]),
          },
          filters: [],
          query: { esql },
          visualization: {
            layerId: 'layer-1',
            layerType: 'data',
            metricAccessor: metricField,
            ...(color ? { color } : {}),
            ...(subtitle ? { subtitle } : {}),
          },
          adHocDataViews: { [dvId(index)]: adHocDV(index) },
        },
      },
    },
  };
}

/**
 * Lens datatable.
 */
function tablePanel({ id, title, description = '', index, esql, columns, grid }) {
  const lensColumns = columns.map((c) => ({
    columnId: c.field,
    fieldName: c.field,
    meta: { type: c.type || 'string', esType: c.esType || 'keyword' },
    ...(c.label ? { customLabel: true, label: c.label } : {}),
  }));
  return {
    type: 'lens',
    gridData: { ...grid, i: id },
    panelIndex: id,
    embeddableConfig: {
      enhancements: {},
      disabledActions: ['OPEN_FLYOUT_ADD_DRILLDOWN'],
      attributes: {
        title,
        description,
        type: 'lens',
        version: 1,
        visualizationType: 'lnsDatatable',
        references: [],
        state: {
          datasourceStates: {
            textBased: textBased(index, esql, lensColumns),
          },
          filters: [],
          query: { esql },
          visualization: {
            layerId: 'layer-1',
            layerType: 'data',
            columns: lensColumns.map((c) => ({ columnId: c.columnId })),
          },
          adHocDataViews: { [dvId(index)]: adHocDV(index) },
        },
      },
    },
  };
}

/**
 * Lens pie/donut.
 */
function donutPanel({
  id,
  title,
  description = '',
  index,
  esql,
  sliceField,
  metricField = 'count',
  grid,
  sliceType = 'string',
  sliceEsType = 'keyword',
}) {
  const columns = [
    {
      columnId: sliceField,
      fieldName: sliceField,
      meta: { type: sliceType, esType: sliceEsType },
    },
    {
      columnId: metricField,
      fieldName: metricField,
      meta: { type: 'number', esType: 'long' },
    },
  ];
  return {
    type: 'lens',
    gridData: { ...grid, i: id },
    panelIndex: id,
    embeddableConfig: {
      enhancements: {},
      disabledActions: ['OPEN_FLYOUT_ADD_DRILLDOWN'],
      attributes: {
        title,
        description,
        type: 'lens',
        version: 1,
        visualizationType: 'lnsPie',
        references: [],
        state: {
          datasourceStates: {
            textBased: textBased(index, esql, columns),
          },
          filters: [],
          query: { esql },
          visualization: {
            shape: 'donut',
            layers: [
              {
                layerId: 'layer-1',
                layerType: 'data',
                primaryGroups: [sliceField],
                metrics: [metricField],
                categoryDisplay: 'default',
                legendDisplay: 'show',
                numberDisplay: 'percent',
                truncateLegend: true,
                maxLegendLines: 1,
                nestedLegend: false,
              },
            ],
          },
          adHocDataViews: { [dvId(index)]: adHocDV(index) },
        },
      },
    },
  };
}

/**
 * Lens bar (vertical, not stacked by default).
 */
function barPanel({
  id,
  title,
  description = '',
  index,
  esql,
  xField,
  yField,
  splitField,
  stacked = false,
  horizontal = false,
  grid,
  xType = 'string',
  xEsType = 'keyword',
}) {
  const columns = [
    {
      columnId: xField,
      fieldName: xField,
      meta: { type: xType, esType: xEsType },
    },
    {
      columnId: yField,
      fieldName: yField,
      meta: { type: 'number', esType: 'long' },
    },
    ...(splitField
      ? [
          {
            columnId: splitField,
            fieldName: splitField,
            meta: { type: 'string', esType: 'keyword' },
          },
        ]
      : []),
  ];
  const horizontalSeries = stacked ? 'bar_horizontal_stacked' : 'bar_horizontal';
  const verticalSeries = stacked ? 'bar_stacked' : 'bar';
  const seriesType = horizontal ? horizontalSeries : verticalSeries;
  return {
    type: 'lens',
    gridData: { ...grid, i: id },
    panelIndex: id,
    embeddableConfig: {
      enhancements: {},
      disabledActions: ['OPEN_FLYOUT_ADD_DRILLDOWN'],
      attributes: {
        title,
        description,
        type: 'lens',
        version: 1,
        visualizationType: 'lnsXY',
        references: [],
        state: {
          datasourceStates: {
            textBased: textBased(index, esql, columns),
          },
          filters: [],
          query: { esql },
          visualization: {
            preferredSeriesType: seriesType,
            legend: { isVisible: true, position: 'right' },
            valueLabels: 'hide',
            fittingFunction: 'None',
            axisTitlesVisibilitySettings: { x: true, yLeft: true, yRight: true },
            tickLabelsVisibilitySettings: { x: true, yLeft: true, yRight: true },
            labelsOrientation: { x: 0, yLeft: 0, yRight: 0 },
            gridlinesVisibilitySettings: { x: true, yLeft: true, yRight: true },
            layers: [
              {
                layerId: 'layer-1',
                layerType: 'data',
                seriesType,
                accessors: [yField],
                xAccessor: xField,
                ...(splitField ? { splitAccessor: splitField } : {}),
              },
            ],
          },
          adHocDataViews: { [dvId(index)]: adHocDV(index) },
        },
      },
    },
  };
}

/**
 * Lens line chart.
 */
function linePanel({ id, title, description = '', index, esql, xField, yField, splitField, grid }) {
  const columns = [
    {
      columnId: xField,
      fieldName: xField,
      meta: { type: 'date', esType: 'date' },
    },
    {
      columnId: yField,
      fieldName: yField,
      meta: { type: 'number', esType: 'long' },
    },
    ...(splitField
      ? [
          {
            columnId: splitField,
            fieldName: splitField,
            meta: { type: 'string', esType: 'keyword' },
          },
        ]
      : []),
  ];
  return {
    type: 'lens',
    gridData: { ...grid, i: id },
    panelIndex: id,
    embeddableConfig: {
      enhancements: {},
      disabledActions: ['OPEN_FLYOUT_ADD_DRILLDOWN'],
      attributes: {
        title,
        description,
        type: 'lens',
        version: 1,
        visualizationType: 'lnsXY',
        references: [],
        state: {
          datasourceStates: {
            textBased: textBased(index, esql, columns),
          },
          filters: [],
          query: { esql },
          visualization: {
            preferredSeriesType: 'line',
            legend: { isVisible: true, position: 'right' },
            valueLabels: 'hide',
            fittingFunction: 'Linear',
            axisTitlesVisibilitySettings: { x: true, yLeft: true, yRight: true },
            tickLabelsVisibilitySettings: { x: true, yLeft: true, yRight: true },
            labelsOrientation: { x: 0, yLeft: 0, yRight: 0 },
            gridlinesVisibilitySettings: { x: true, yLeft: true, yRight: true },
            layers: [
              {
                layerId: 'layer-1',
                layerType: 'data',
                seriesType: 'line',
                accessors: [yField],
                xAccessor: xField,
                ...(splitField ? { splitAccessor: splitField } : {}),
              },
            ],
          },
          adHocDataViews: { [dvId(index)]: adHocDV(index) },
        },
      },
    },
  };
}

/**
 * Markdown / text panel (context banner). Uses the markdown visualization.
 */
function markdownPanel({ id, title, markdown, grid }) {
  return {
    type: 'visualization',
    gridData: { ...grid, i: id },
    panelIndex: id,
    embeddableConfig: {
      enhancements: {},
      savedVis: {
        id: '',
        title,
        description: '',
        type: 'markdown',
        params: {
          fontSize: 12,
          openLinksInNewTab: true,
          markdown,
        },
        uiState: {},
        data: { aggs: [], searchSource: { query: { query: '', language: 'kuery' }, filter: [] } },
      },
    },
  };
}

// ─── Panel layout ─────────────────────────────────────────────────────────
//
// Grid is 48 columns wide. Tiles of 8w = six across; 12w = four across;
// 16w = three across; 24w = two across; 48w = full width.
//
// Rows are stacked vertically with no gap (Kibana snaps to the grid).
// ──────────────────────────────────────────────────────────────────────────

const panels = [];
let y = 0;

// ─── Row 0: Context banner (y=0, h=4) ─────────────────────────────────────
panels.push(
  markdownPanel({
    id: 'soc-banner',
    title: 'Argus — Command Center',
    markdown: [
      '## Argus — Command Center',
      '',
      'One-look situational awareness for the self-governed SOC simulation.',
      'Sections are ordered by operational urgency:',
      '',
      '1. **At-a-glance** — is the system running and in control right now?',
      '2. **Alert → Case flow** — what is moving through the pipeline?',
      '3. **Autonomous self-governance** — what has the system changed about itself, and what was blocked?',
      '4. **Response paths** — pending deterministic and agentic recommendations, side-by-side.',
      '5. **System health** — which agents and connectors are healthy?',
      '6. **Attack simulation** — what is being fired at the SOC?',
      '7. **Learning & evolution** — how is detection quality trending?',
      '8. **Shift handover** — the operator inbox: what happened while you were away.',
      '9. **Skills ROI** — estimated hours and dollars saved by each autonomous skill.',
      '10. **Reasoning trace** — what agents actually did on each run.',
      '11. **Forensic summaries** — durable per-case record of IOCs, YARA rules, and exceptions.',
      '12. **Workflow catalogue** — every canonical workflow, its automation level, and connectors.',
      '',
      'If the top banner shows **Autonomy: DISABLED** the kill-switch has been pulled — no autonomous mutations are being applied.',
    ].join('\n'),
    grid: { x: 0, y, w: 48, h: 4 },
  })
);
y += 4;

// ─── Row 1: At-a-glance (y=4, h=6) ────────────────────────────────────────
// 6 tiles × 8 width
panels.push(
  metricPanel({
    id: 'soc-glance-autonomy',
    title: 'Autonomy',
    description:
      'Global kill-switch state. DISABLED means no autonomous mutations are being applied.',
    index: '.soc-kill-switch',
    esql: [
      'FROM .soc-kill-switch',
      '| WHERE scope == "global"',
      '| SORT @timestamp DESC',
      '| LIMIT 1',
      '| EVAL autonomy = CASE(autonomy_enabled == true, "ENABLED", "DISABLED")',
      '| KEEP autonomy',
    ].join(' '),
    metricField: 'autonomy',
    metricType: 'string',
    esType: 'keyword',
    color: '#00BFB3',
    grid: { x: 0, y, w: 8, h: 6 },
  })
);
panels.push(
  metricPanel({
    id: 'soc-glance-heartbeat',
    title: 'Pipeline heartbeat (min)',
    description: 'Minutes since the most recent pipeline cycle event.',
    index: '.soc-metrics',
    esql: [
      'FROM .soc-metrics',
      '| SORT @timestamp DESC',
      '| LIMIT 1',
      '| EVAL age_min = TO_INTEGER(DATE_DIFF("minutes", @timestamp, NOW()))',
      '| KEEP age_min',
    ].join(' '),
    metricField: 'age_min',
    color: '#FEC514',
    subtitle: 'minutes since last cycle',
    grid: { x: 8, y, w: 8, h: 6 },
  })
);
panels.push(
  metricPanel({
    id: 'soc-glance-difficulty',
    title: 'Attack difficulty',
    description: 'Current difficulty level driving the attack profile selection.',
    index: '.soc-difficulty-state',
    esql: [
      'FROM .soc-difficulty-state',
      '| SORT @timestamp DESC',
      '| LIMIT 1',
      '| KEEP level',
    ].join(' '),
    metricField: 'level',
    color: '#F583B7',
    grid: { x: 16, y, w: 8, h: 6 },
  })
);
panels.push(
  metricPanel({
    id: 'soc-glance-pending-recs',
    title: 'Pending recommendations',
    description: 'Recommendations awaiting review or automatic apply.',
    index: '.soc-recommendations',
    esql: [
      'FROM .soc-recommendations',
      '| WHERE status == "pending"',
      '| STATS pending = COUNT(*)',
    ].join(' '),
    metricField: 'pending',
    color: '#54B399',
    grid: { x: 24, y, w: 8, h: 6 },
  })
);
panels.push(
  metricPanel({
    id: 'soc-glance-applied',
    title: 'Mutations applied (24h)',
    description:
      'Applied mutations in the last 24h (budget is ' + 'daily_budget_all=50 by default).',
    index: '.soc-evolution-log',
    esql: [
      'FROM .soc-evolution-log',
      '| WHERE result == "applied" AND @timestamp > NOW() - 24 hours',
      '| STATS applied = COUNT(*)',
    ].join(' '),
    metricField: 'applied',
    color: '#00BFB3',
    subtitle: 'applied / 50 budget',
    grid: { x: 32, y, w: 8, h: 6 },
  })
);
panels.push(
  metricPanel({
    id: 'soc-glance-blocked',
    title: 'Mutations blocked (24h)',
    description: 'Intents blocked by governance gates (canonical / budget / cooldown / loop).',
    index: '.soc-evolution-log',
    esql: [
      'FROM .soc-evolution-log',
      '| WHERE result IN ("blocked_canonical","blocked_budget","blocked_cooldown","blocked_loop")',
      '  AND @timestamp > NOW() - 24 hours',
      '| STATS blocked = COUNT(*)',
    ].join(' '),
    metricField: 'blocked',
    color: '#BD271E',
    grid: { x: 40, y, w: 8, h: 6 },
  })
);
y += 6;

// ─── Row 2: Alert → Case flow (y=10, h=12) ────────────────────────────────
panels.push(
  linePanel({
    id: 'soc-flow-triage-line',
    title: 'Triage events over time (24h)',
    index: '.soc-triage-results',
    esql: [
      'FROM .soc-triage-results',
      '| WHERE @timestamp > NOW() - 24 hours',
      '| STATS count = COUNT(*) BY classification, bucket = BUCKET(@timestamp, 1 hour)',
      '| SORT bucket ASC',
    ].join(' '),
    xField: 'bucket',
    yField: 'count',
    splitField: 'classification',
    grid: { x: 0, y, w: 24, h: 12 },
  })
);
panels.push(
  donutPanel({
    id: 'soc-flow-classifications',
    title: 'Triage classifications (24h)',
    index: '.soc-triage-results',
    esql: [
      'FROM .soc-triage-results',
      '| WHERE @timestamp > NOW() - 24 hours',
      '| STATS count = COUNT(*) BY classification',
      '| SORT count DESC',
    ].join(' '),
    sliceField: 'classification',
    grid: { x: 24, y, w: 12, h: 12 },
  })
);
panels.push(
  donutPanel({
    id: 'soc-flow-dispositions',
    title: 'Case dispositions (24h)',
    index: '.soc-outcomes',
    esql: [
      'FROM .soc-outcomes',
      '| WHERE @timestamp > NOW() - 24 hours',
      '| STATS count = COUNT(*) BY disposition',
      '| SORT count DESC',
    ].join(' '),
    sliceField: 'disposition',
    grid: { x: 36, y, w: 12, h: 12 },
  })
);
y += 12;

// ─── Row 3: Detection quality (y=22, h=12) ────────────────────────────────
panels.push(
  metricPanel({
    id: 'soc-det-ttd-p50',
    title: 'Time to detect p50 (ms)',
    description: 'Median detection latency across all attacks in the window.',
    index: '.soc-detection-metrics',
    esql: [
      'FROM .soc-detection-metrics',
      '| WHERE @timestamp > NOW() - 24 hours',
      '| STATS ttd_p50 = TO_INTEGER(PERCENTILE(time_to_detect_ms, 50))',
    ].join(' '),
    metricField: 'ttd_p50',
    color: '#00BFB3',
    grid: { x: 0, y, w: 8, h: 6 },
  })
);
panels.push(
  metricPanel({
    id: 'soc-det-ttd-p95',
    title: 'Time to detect p95 (ms)',
    description: '95th-percentile detection latency.',
    index: '.soc-detection-metrics',
    esql: [
      'FROM .soc-detection-metrics',
      '| WHERE @timestamp > NOW() - 24 hours',
      '| STATS ttd_p95 = TO_INTEGER(PERCENTILE(time_to_detect_ms, 95))',
    ].join(' '),
    metricField: 'ttd_p95',
    color: '#FEC514',
    grid: { x: 8, y, w: 8, h: 6 },
  })
);
panels.push(
  metricPanel({
    id: 'soc-det-triage-correct',
    title: 'Triage accuracy (24h)',
    description:
      'Share of triage verdicts where triage_correct=true (ground-truthed vs. attack sim).',
    index: '.soc-detection-metrics',
    esql: [
      'FROM .soc-detection-metrics',
      '| WHERE @timestamp > NOW() - 24 hours AND triage_correct IS NOT NULL',
      '| EVAL correct_flag = CASE(triage_correct == true, 1, 0)',
      '| STATS total = COUNT(*), correct = SUM(correct_flag)',
      '| EVAL accuracy_pct = TO_INTEGER(correct * 100 / total)',
      '| KEEP accuracy_pct',
    ].join(' '),
    metricField: 'accuracy_pct',
    color: '#54B399',
    subtitle: '% correct',
    grid: { x: 16, y, w: 8, h: 6 },
  })
);
panels.push(
  tablePanel({
    id: 'soc-det-coverage-gaps',
    title: 'Top coverage gaps',
    description: 'Techniques most frequently observed without a firing detection rule.',
    index: '.soc-coverage-gaps',
    esql: [
      'FROM .soc-coverage-gaps',
      '| SORT occurrences DESC',
      '| LIMIT 10',
      '| KEEP technique_id, occurrences, avg_confidence',
    ].join(' '),
    columns: [
      { field: 'technique_id', type: 'string', esType: 'keyword', label: 'MITRE' },
      { field: 'occurrences', type: 'number', esType: 'integer', label: 'Occurrences' },
      { field: 'avg_confidence', type: 'number', esType: 'float', label: 'Avg confidence' },
    ],
    grid: { x: 24, y, w: 24, h: 12 },
  })
);
panels.push(
  linePanel({
    id: 'soc-det-ttd-line',
    title: 'Time-to-detect trend',
    index: '.soc-detection-metrics',
    esql: [
      'FROM .soc-detection-metrics',
      '| WHERE @timestamp > NOW() - 24 hours',
      '| STATS p50 = PERCENTILE(time_to_detect_ms, 50), p95 = PERCENTILE(time_to_detect_ms, 95)',
      '  BY bucket = BUCKET(@timestamp, 1 hour)',
      '| SORT bucket ASC',
    ].join(' '),
    xField: 'bucket',
    yField: 'p50',
    grid: { x: 0, y: y + 6, w: 24, h: 6 },
  })
);
y += 12;

// ─── Row 4: Autonomous self-governance (y=34, h=12) ───────────────────────
panels.push(
  barPanel({
    id: 'soc-gov-mutations-time',
    title: 'Autonomous mutations (24h) — by result',
    description: 'Every attempt made by soc-autonomous-applier in the last 24h, stacked by result.',
    index: '.soc-evolution-log',
    esql: [
      'FROM .soc-evolution-log',
      '| WHERE source == "soc-autonomous-applier" AND @timestamp > NOW() - 24 hours',
      '| STATS count = COUNT(*) BY result, bucket = BUCKET(@timestamp, 1 hour)',
      '| SORT bucket ASC',
    ].join(' '),
    xField: 'bucket',
    yField: 'count',
    splitField: 'result',
    stacked: true,
    grid: { x: 0, y, w: 24, h: 12 },
  })
);
panels.push(
  donutPanel({
    id: 'soc-gov-rejection-reasons',
    title: 'Rejection reasons (24h)',
    description:
      'Why intents were blocked by the governance rails. ' +
      'canonical = owner is canonical; budget = daily cap exhausted; ' +
      'cooldown = too-recent mutation on same artifact; loop = oscillation detected.',
    index: '.soc-evolution-log',
    esql: [
      'FROM .soc-evolution-log',
      '| WHERE result IN ("blocked_canonical","blocked_budget","blocked_cooldown","blocked_loop")',
      '  AND @timestamp > NOW() - 24 hours',
      '| STATS count = COUNT(*) BY result',
      '| SORT count DESC',
    ].join(' '),
    sliceField: 'result',
    grid: { x: 24, y, w: 24, h: 12 },
  })
);
y += 12;

// ─── Row 5: Governance detail (y=46, h=10) ────────────────────────────────
panels.push(
  metricPanel({
    id: 'soc-gov-budget',
    title: 'Daily budget used',
    description: 'Applied mutations today vs. daily_budget_all=50 from soc-autonomous-applier.',
    index: '.soc-evolution-log',
    esql: [
      'FROM .soc-evolution-log',
      '| WHERE source == "soc-autonomous-applier" AND result == "applied"',
      '  AND @timestamp > NOW() - 24 hours',
      '| STATS applied_24h = COUNT(*)',
      '| EVAL pct = TO_INTEGER(applied_24h * 100 / 50)',
      '| KEEP pct',
    ].join(' '),
    metricField: 'pct',
    color: '#FEC514',
    subtitle: '% of daily_budget_all (50)',
    grid: { x: 0, y, w: 12, h: 10 },
  })
);
panels.push(
  tablePanel({
    id: 'soc-gov-loop-hotspots',
    title: 'Loop-threshold hot spots',
    description:
      'Artifacts with ≥ 2 applied/failed attempts in the last 24h. ' +
      'loop_threshold is 3 — these will be auto-rejected on the next attempt.',
    index: '.soc-evolution-log',
    esql: [
      'FROM .soc-evolution-log',
      '| WHERE source == "soc-autonomous-applier"',
      '  AND result IN ("applied","failure","validation_failed")',
      '  AND @timestamp > NOW() - 24 hours',
      '| STATS attempts = COUNT(*) BY artifact_id',
      '| WHERE attempts >= 2',
      '| SORT attempts DESC',
      '| LIMIT 10',
    ].join(' '),
    columns: [
      { field: 'artifact_id', type: 'string', esType: 'keyword', label: 'Artifact' },
      { field: 'attempts', type: 'number', esType: 'long', label: 'Attempts (24h)' },
    ],
    grid: { x: 12, y, w: 12, h: 10 },
  })
);
panels.push(
  barPanel({
    id: 'soc-gov-by-type',
    title: 'Applied mutations by artifact type (7d)',
    description: 'Which surfaces is Argus actually editing?',
    index: '.soc-evolution-log',
    esql: [
      'FROM .soc-evolution-log',
      '| WHERE source == "soc-autonomous-applier" AND result == "applied"',
      '  AND @timestamp > NOW() - 7 days',
      '| STATS count = COUNT(*) BY artifact_type',
      '| SORT count DESC',
    ].join(' '),
    xField: 'artifact_type',
    yField: 'count',
    horizontal: true,
    grid: { x: 24, y, w: 24, h: 10 },
  })
);
y += 10;

// ─── Row 6: Recent evolution activity (y=56, h=14) ────────────────────────
panels.push(
  tablePanel({
    id: 'soc-gov-recent-mutations',
    title: 'Recent applier activity',
    description:
      'Every row soc-autonomous-applier has written to .soc-evolution-log, most recent first. ' +
      'This is the tamper-evident audit trail.',
    index: '.soc-evolution-log',
    esql: [
      'FROM .soc-evolution-log',
      '| WHERE source == "soc-autonomous-applier"',
      '| SORT @timestamp DESC',
      '| LIMIT 25',
      '| KEEP @timestamp, artifact_type, artifact_id, op, result, reason',
    ].join(' '),
    columns: [
      { field: '@timestamp', type: 'date', esType: 'date', label: 'When' },
      { field: 'artifact_type', type: 'string', esType: 'keyword', label: 'Type' },
      { field: 'artifact_id', type: 'string', esType: 'keyword', label: 'Artifact' },
      { field: 'op', type: 'string', esType: 'keyword', label: 'Op' },
      { field: 'result', type: 'string', esType: 'keyword', label: 'Result' },
      { field: 'reason', type: 'string', esType: 'text', label: 'Reason' },
    ],
    grid: { x: 0, y, w: 48, h: 14 },
  })
);
y += 14;

// ─── Row 7: Side-by-side response paths (deterministic vs agentic) ─────────
//
// This replaces the old generic "Pending recommendations" row. The PM vision
// asks for two tracks, visually side-by-side, so operators see what automation
// did deterministically AND what the agents are proposing to do.
panels.push(
  markdownPanel({
    id: 'soc-recs-banner',
    title: 'Response paths',
    markdown: [
      '### Response paths — deterministic vs agentic',
      '',
      'Left column is workflow-driven (evidence-backed, idempotent). ' +
        'Right column is LLM-reasoned (evidence + confidence + expected impact). ' +
        'Operators see both side-by-side and decide what to trust.',
    ].join('\n'),
    grid: { x: 0, y, w: 48, h: 3 },
  })
);
y += 3;
panels.push(
  tablePanel({
    id: 'soc-recs-deterministic',
    title: 'Deterministic recommendations (pending)',
    description:
      'Produced by workflow-driven analysis. Evidence is an ES|QL query or ' +
      'aggregation; impact is a scalar the workflow computed.',
    index: '.soc-recommendations',
    esql: [
      'FROM .soc-recommendations',
      '| WHERE status == "pending" AND track == "deterministic"',
      '| SORT @timestamp DESC',
      '| LIMIT 20',
      '| KEEP @timestamp, type, title, confidence, source',
    ].join(' '),
    columns: [
      { field: '@timestamp', type: 'date', esType: 'date', label: 'When' },
      { field: 'type', type: 'string', esType: 'keyword', label: 'Type' },
      { field: 'title', type: 'string', esType: 'text', label: 'Title' },
      { field: 'confidence', type: 'number', esType: 'integer', label: 'Conf' },
      { field: 'source', type: 'string', esType: 'keyword', label: 'Source' },
    ],
    grid: { x: 0, y, w: 24, h: 12 },
  })
);
panels.push(
  tablePanel({
    id: 'soc-recs-agentic',
    title: 'Agentic recommendations (pending)',
    description:
      'Produced by LLM reasoning. Confidence and expected_impact are estimates; ' +
      'every row carries at least one evidence item (enforced by the applier).',
    index: '.soc-recommendations',
    esql: [
      'FROM .soc-recommendations',
      '| WHERE status == "pending" AND track == "agentic"',
      '| SORT @timestamp DESC',
      '| LIMIT 20',
      '| KEEP @timestamp, type, title, confidence, source',
    ].join(' '),
    columns: [
      { field: '@timestamp', type: 'date', esType: 'date', label: 'When' },
      { field: 'type', type: 'string', esType: 'keyword', label: 'Type' },
      { field: 'title', type: 'string', esType: 'text', label: 'Title' },
      { field: 'confidence', type: 'number', esType: 'integer', label: 'Conf' },
      { field: 'source', type: 'string', esType: 'keyword', label: 'Source' },
    ],
    grid: { x: 24, y, w: 24, h: 12 },
  })
);
y += 12;

// ─── Row 8: System health (y=82, h=12) ────────────────────────────────────
panels.push(
  tablePanel({
    id: 'soc-health-agents',
    title: 'Agent health',
    description:
      'Latest health sample per agent. error_rate and latency_p95 are the fastest signs of agent degradation.',
    index: '.soc-agent-health',
    esql: [
      'FROM .soc-agent-health',
      '| SORT @timestamp DESC',
      '| STATS latest = VALUES(status), p50 = MAX(latency_p50), p95 = MAX(latency_p95),',
      '  err = MAX(error_rate), tput = MAX(throughput) BY agent_id',
      '| SORT err DESC',
      '| LIMIT 15',
    ].join(' '),
    columns: [
      { field: 'agent_id', type: 'string', esType: 'keyword', label: 'Agent' },
      { field: 'latest', type: 'string', esType: 'keyword', label: 'Status' },
      { field: 'p50', type: 'number', esType: 'float', label: 'p50 (ms)' },
      { field: 'p95', type: 'number', esType: 'float', label: 'p95 (ms)' },
      { field: 'err', type: 'number', esType: 'float', label: 'Error rate' },
      { field: 'tput', type: 'number', esType: 'float', label: 'Throughput' },
    ],
    grid: { x: 0, y, w: 24, h: 12 },
  })
);
panels.push(
  tablePanel({
    id: 'soc-health-connectors',
    title: 'Connector health',
    description:
      'External connector (model, enrichment, notification) latency and failure streaks.',
    index: '.soc-connector-health',
    esql: [
      'FROM .soc-connector-health',
      '| SORT @timestamp DESC',
      '| STATS status = VALUES(status), latency_ms = MAX(latency_ms),',
      '  failures = MAX(consecutive_failures), fallback = VALUES(fallback_connector_id)',
      '  BY connector_id, connector_name',
      '| SORT failures DESC, latency_ms DESC',
      '| LIMIT 15',
    ].join(' '),
    columns: [
      { field: 'connector_name', type: 'string', esType: 'keyword', label: 'Connector' },
      { field: 'status', type: 'string', esType: 'keyword', label: 'Status' },
      { field: 'latency_ms', type: 'number', esType: 'long', label: 'Latency (ms)' },
      { field: 'failures', type: 'number', esType: 'integer', label: 'Consecutive fails' },
      { field: 'fallback', type: 'string', esType: 'keyword', label: 'Fallback' },
    ],
    grid: { x: 24, y, w: 24, h: 12 },
  })
);
y += 12;

// ─── Row 9: Attack simulation (y=94, h=12) ────────────────────────────────
panels.push(
  donutPanel({
    id: 'soc-atk-status',
    title: 'Attack commands by status (24h)',
    index: '.soc-attack-commands',
    esql: [
      'FROM .soc-attack-commands',
      '| WHERE @timestamp > NOW() - 24 hours',
      '| STATS count = COUNT(*) BY status',
      '| SORT count DESC',
    ].join(' '),
    sliceField: 'status',
    grid: { x: 0, y, w: 16, h: 12 },
  })
);
panels.push(
  barPanel({
    id: 'soc-atk-difficulty',
    title: 'Attacks by difficulty (24h)',
    index: '.soc-attack-commands',
    esql: [
      'FROM .soc-attack-commands',
      '| WHERE @timestamp > NOW() - 24 hours',
      '| STATS count = COUNT(*) BY difficulty',
      '| SORT difficulty ASC',
    ].join(' '),
    xField: 'difficulty',
    yField: 'count',
    xType: 'number',
    xEsType: 'integer',
    grid: { x: 16, y, w: 16, h: 12 },
  })
);
panels.push(
  tablePanel({
    id: 'soc-atk-recent',
    title: 'Most recent attack operations',
    index: '.soc-attack-commands',
    esql: [
      'FROM .soc-attack-commands',
      '| SORT @timestamp DESC',
      '| LIMIT 10',
      '| KEEP @timestamp, profile, difficulty, status, operation_id',
    ].join(' '),
    columns: [
      { field: '@timestamp', type: 'date', esType: 'date', label: 'When' },
      { field: 'profile', type: 'string', esType: 'keyword', label: 'Profile' },
      { field: 'difficulty', type: 'number', esType: 'integer', label: 'Diff' },
      { field: 'status', type: 'string', esType: 'keyword', label: 'Status' },
      { field: 'operation_id', type: 'string', esType: 'keyword', label: 'Op ID' },
    ],
    grid: { x: 32, y, w: 16, h: 12 },
  })
);
y += 12;

// ─── Row 10: Learning & evolution (y=106, h=12) ───────────────────────────
panels.push(
  metricPanel({
    id: 'soc-learn-regression-last',
    title: 'Last regression gate',
    description: 'Result of the most recent soc-regression-gate run.',
    index: '.soc-regression-runs',
    esql: [
      'FROM .soc-regression-runs',
      '| SORT @timestamp DESC',
      '| LIMIT 1',
      '| KEEP gate_result',
    ].join(' '),
    metricField: 'gate_result',
    metricType: 'string',
    esType: 'keyword',
    color: '#54B399',
    grid: { x: 0, y, w: 12, h: 6 },
  })
);
panels.push(
  metricPanel({
    id: 'soc-learn-regression-delta',
    title: 'Regression delta',
    description: 'Fraction of regressed cases (0 = clean, 1 = everything regressed).',
    index: '.soc-regression-runs',
    esql: [
      'FROM .soc-regression-runs',
      '| SORT @timestamp DESC',
      '| LIMIT 1',
      '| KEEP regression_delta',
    ].join(' '),
    metricField: 'regression_delta',
    metricType: 'number',
    esType: 'float',
    color: '#BD271E',
    grid: { x: 0, y: y + 6, w: 12, h: 6 },
  })
);
panels.push(
  tablePanel({
    id: 'soc-learn-trust-tiers',
    title: 'Trust scores by tier',
    description:
      'Approval rate per evolution tier. Tiers at ≥90% become eligible for auto-approval.',
    index: '.soc-trust-scores',
    esql: [
      'FROM .soc-trust-scores',
      '| SORT @timestamp DESC',
      '| STATS total = MAX(total_proposals), approved = MAX(approved_count),',
      '  rejected = MAX(rejected_count), applied = MAX(applied_count),',
      '  failed = MAX(failed_count), approval_rate = MAX(approval_rate),',
      '  auto = VALUES(auto_approve_eligible) BY tier',
      '| SORT approval_rate DESC',
    ].join(' '),
    columns: [
      { field: 'tier', type: 'string', esType: 'keyword', label: 'Tier' },
      { field: 'total', type: 'number', esType: 'integer', label: 'Total' },
      { field: 'approved', type: 'number', esType: 'integer', label: 'Approved' },
      { field: 'rejected', type: 'number', esType: 'integer', label: 'Rejected' },
      { field: 'applied', type: 'number', esType: 'integer', label: 'Applied' },
      { field: 'failed', type: 'number', esType: 'integer', label: 'Failed' },
      { field: 'approval_rate', type: 'number', esType: 'float', label: 'Approval rate' },
      { field: 'auto', type: 'boolean', esType: 'boolean', label: 'Auto-eligible' },
    ],
    grid: { x: 12, y, w: 36, h: 12 },
  })
);
y += 12;

// ─── Row 11: Infra plumbing (y=118, h=10) ─────────────────────────────────
panels.push(
  linePanel({
    id: 'soc-infra-deadletter',
    title: 'Dead letters over time (24h)',
    description:
      'Events the pipeline refused to process and parked. A rising line means something is misbehaving upstream.',
    index: '.soc-dead-letter',
    esql: [
      'FROM .soc-dead-letter',
      '| WHERE @timestamp > NOW() - 24 hours',
      '| STATS count = COUNT(*) BY bucket = BUCKET(@timestamp, 1 hour)',
      '| SORT bucket ASC',
    ].join(' '),
    xField: 'bucket',
    yField: 'count',
    grid: { x: 0, y, w: 16, h: 10 },
  })
);
panels.push(
  donutPanel({
    id: 'soc-infra-audit-events',
    title: 'Audit trail events (24h)',
    description: 'All governance / lifecycle events emitted to .soc-audit-trail.',
    index: '.soc-audit-trail',
    esql: [
      'FROM .soc-audit-trail',
      '| WHERE @timestamp > NOW() - 24 hours',
      '| STATS count = COUNT(*) BY event_type',
      '| SORT count DESC',
    ].join(' '),
    sliceField: 'event_type',
    grid: { x: 16, y, w: 16, h: 10 },
  })
);
panels.push(
  metricPanel({
    id: 'soc-infra-cycle-p95',
    title: 'Cycle duration p95 (ms)',
    description: '95th-percentile pipeline cycle duration over the last 24h.',
    index: '.soc-metrics',
    esql: [
      'FROM .soc-metrics',
      '| WHERE @timestamp > NOW() - 24 hours',
      '| STATS p95 = TO_INTEGER(PERCENTILE(cycle_duration_ms, 95))',
    ].join(' '),
    metricField: 'p95',
    color: '#00BFB3',
    grid: { x: 32, y, w: 16, h: 10 },
  })
);
y += 10;

// ─── Row 12: Shift handover (operator inbox) ──────────────────────────────
panels.push(
  markdownPanel({
    id: 'soc-handover-banner',
    title: 'Shift handover inbox',
    markdown: [
      '### Shift handover inbox',
      '',
      'Every 8 hours `soc-shift-handover` composes a narrative summary of ' +
        'what the autonomous SOC did while you were away. The most recent ' +
        'narrative is below; earlier handovers are in the table.',
    ].join('\n'),
    grid: { x: 0, y, w: 48, h: 3 },
  })
);
y += 3;
panels.push(
  tablePanel({
    id: 'soc-handover-latest',
    title: 'Most recent shift narrative',
    description:
      'Most recent shift-handover document. Narrative is markdown authored by soc-meta-agent.',
    index: '.soc-shift-handover',
    esql: [
      'FROM .soc-shift-handover',
      '| SORT generated_at DESC',
      '| LIMIT 1',
      '| KEEP shift_id, shift_start_ts, shift_end_ts, narrative_markdown',
    ].join(' '),
    columns: [
      { field: 'shift_id', type: 'string', esType: 'keyword', label: 'Shift' },
      { field: 'shift_start_ts', type: 'date', esType: 'date', label: 'Start' },
      { field: 'shift_end_ts', type: 'date', esType: 'date', label: 'End' },
      { field: 'narrative_markdown', type: 'string', esType: 'text', label: 'Narrative' },
    ],
    grid: { x: 0, y, w: 48, h: 12 },
  })
);
y += 12;
panels.push(
  tablePanel({
    id: 'soc-handover-history',
    title: 'Previous shift handovers',
    description: 'All handovers in the window, newest first.',
    index: '.soc-shift-handover',
    esql: [
      'FROM .soc-shift-handover',
      '| SORT generated_at DESC',
      '| LIMIT 10',
      '| KEEP shift_id, shift_end_ts, counters.cases_opened, counters.cases_closed, counters.kill_switch_events, counters.mutations_applied, counters.mutations_blocked',
    ].join(' '),
    columns: [
      { field: 'shift_id', type: 'string', esType: 'keyword', label: 'Shift' },
      { field: 'shift_end_ts', type: 'date', esType: 'date', label: 'End' },
      { field: 'counters.cases_opened', type: 'number', esType: 'integer', label: 'Cases opened' },
      { field: 'counters.cases_closed', type: 'number', esType: 'integer', label: 'Cases closed' },
      {
        field: 'counters.kill_switch_events',
        type: 'number',
        esType: 'integer',
        label: 'Kill-switch',
      },
      { field: 'counters.mutations_applied', type: 'number', esType: 'integer', label: 'Applied' },
      { field: 'counters.mutations_blocked', type: 'number', esType: 'integer', label: 'Blocked' },
    ],
    grid: { x: 0, y, w: 48, h: 10 },
  })
);
y += 10;

// ─── Row 13: Skills ROI ──────────────────────────────────────────────────
panels.push(
  markdownPanel({
    id: 'soc-skills-banner',
    title: 'Skills ROI',
    markdown: [
      '### Skills ROI',
      '',
      'Rolled up hourly by `soc-skill-metrics-roller`. ' +
        'Values are **estimates** (`estimate=true`) — baseline is 25 minutes ' +
        'saved per successful autonomous action at $90/hr analyst rate. Use ' +
        'these as operational order-of-magnitude signals, not CFO-grade receipts.',
    ].join('\n'),
    grid: { x: 0, y, w: 48, h: 3 },
  })
);
y += 3;
panels.push(
  tablePanel({
    id: 'soc-skills-roi',
    title: 'Skills ROI (7d)',
    description: 'Success rate, hours saved, and cost saved per skill. Sorted by hours saved.',
    index: '.soc-skill-metrics',
    esql: [
      'FROM .soc-skill-metrics',
      '| SORT hours_saved_est_7d DESC',
      '| LIMIT 25',
      '| KEEP skill_id, invocations_7d, success_rate_7d, hours_saved_est_7d, cost_saved_usd_est_7d, last_run_ts',
    ].join(' '),
    columns: [
      { field: 'skill_id', type: 'string', esType: 'keyword', label: 'Skill' },
      { field: 'invocations_7d', type: 'number', esType: 'integer', label: 'Runs 7d' },
      { field: 'success_rate_7d', type: 'number', esType: 'float', label: 'Success rate' },
      { field: 'hours_saved_est_7d', type: 'number', esType: 'float', label: 'Hours saved (est)' },
      {
        field: 'cost_saved_usd_est_7d',
        type: 'number',
        esType: 'float',
        label: 'Cost saved USD (est)',
      },
      { field: 'last_run_ts', type: 'date', esType: 'date', label: 'Last run' },
    ],
    grid: { x: 0, y, w: 48, h: 12 },
  })
);
y += 12;

// ─── Row 14: Reasoning trace ─────────────────────────────────────────────
panels.push(
  markdownPanel({
    id: 'soc-reasoning-banner',
    title: 'Reasoning trace',
    markdown: [
      '### Reasoning trace',
      '',
      'Indexed record of what agents actually did on each run. ' +
        'Currently pilot-wired to `soc-triage`; additional workflows will ' +
        'emit `run_summary` records here over time.',
    ].join('\n'),
    grid: { x: 0, y, w: 48, h: 3 },
  })
);
y += 3;
panels.push(
  tablePanel({
    id: 'soc-reasoning-recent',
    title: 'Recent agent runs',
    description:
      'Most recent run_summary records from .soc-reasoning-trace. ' +
      'Drill in by clicking through to Discover.',
    index: '.soc-reasoning-trace',
    esql: [
      'FROM .soc-reasoning-trace',
      '| WHERE step_type == "run_summary"',
      '| SORT @timestamp DESC',
      '| LIMIT 25',
      '| KEEP @timestamp, run_id, agent_id, run_summary.total_steps, run_summary.tool_call_count, run_summary.final_status',
    ].join(' '),
    columns: [
      { field: '@timestamp', type: 'date', esType: 'date', label: 'When' },
      { field: 'run_id', type: 'string', esType: 'keyword', label: 'Run' },
      { field: 'agent_id', type: 'string', esType: 'keyword', label: 'Agent' },
      { field: 'run_summary.total_steps', type: 'number', esType: 'integer', label: 'Steps' },
      {
        field: 'run_summary.tool_call_count',
        type: 'number',
        esType: 'integer',
        label: 'Tool calls',
      },
      { field: 'run_summary.final_status', type: 'string', esType: 'keyword', label: 'Status' },
    ],
    grid: { x: 0, y, w: 48, h: 10 },
  })
);
y += 10;

// ─── Row 15: Forensic summaries ──────────────────────────────────────────
panels.push(
  markdownPanel({
    id: 'soc-forensic-banner',
    title: 'Forensic post-investigation panel',
    markdown: [
      '### Forensic summaries',
      '',
      'One immutable document per closed Kibana case (produced by ' +
        '`soc-forensic-summarizer`). Consolidates verdict, IOCs, YARA rules, ' +
        'attribution, and rule exceptions — durable evidence for any ' +
        'retrospective or audit.',
    ].join('\n'),
    grid: { x: 0, y, w: 48, h: 3 },
  })
);
y += 3;
panels.push(
  donutPanel({
    id: 'soc-forensic-verdicts',
    title: 'Verdicts',
    index: '.soc-forensic-summary',
    esql: [
      'FROM .soc-forensic-summary',
      '| STATS count = COUNT(*) BY verdict',
      '| SORT count DESC',
    ].join(' '),
    sliceField: 'verdict',
    grid: { x: 0, y, w: 16, h: 12 },
  })
);
panels.push(
  tablePanel({
    id: 'soc-forensic-recent',
    title: 'Recent closed investigations',
    description:
      'Most recent forensic summaries, newest first. Counts of IOCs / YARA ' +
      'rules / exceptions show how durable each investigation was.',
    index: '.soc-forensic-summary',
    esql: [
      'FROM .soc-forensic-summary',
      '| SORT closed_at DESC',
      '| LIMIT 25',
      '| KEEP closed_at, case_id, verdict',
    ].join(' '),
    columns: [
      { field: 'closed_at', type: 'date', esType: 'date', label: 'Closed at' },
      { field: 'case_id', type: 'string', esType: 'keyword', label: 'Case' },
      { field: 'verdict', type: 'string', esType: 'keyword', label: 'Verdict' },
    ],
    grid: { x: 16, y, w: 32, h: 12 },
  })
);
y += 12;

// ─── Row 16: Workflow catalogue ──────────────────────────────────────────
panels.push(
  markdownPanel({
    id: 'soc-workflow-banner',
    title: 'Workflow catalogue',
    markdown: [
      '### Workflow catalogue',
      '',
      'Sourced from `soc-simulation/workflows/_registry.json` and seeded ' +
        'into `.soc-workflow-registry` by `setup.sh`. Shows what every ' +
        'canonical workflow does, its automation level, and the connectors ' +
        'it touches.',
    ].join('\n'),
    grid: { x: 0, y, w: 48, h: 3 },
  })
);
y += 3;
panels.push(
  donutPanel({
    id: 'soc-workflow-automation',
    title: 'Workflows by automation level',
    index: '.soc-workflow-registry',
    esql: [
      'FROM .soc-workflow-registry',
      '| STATS count = COUNT(*) BY automation_level',
      '| SORT count DESC',
    ].join(' '),
    sliceField: 'automation_level',
    grid: { x: 0, y, w: 16, h: 12 },
  })
);
panels.push(
  tablePanel({
    id: 'soc-workflow-table',
    title: 'Workflow registry',
    description: 'Every canonical workflow with its automation-level tag, connectors, and summary.',
    index: '.soc-workflow-registry',
    esql: [
      'FROM .soc-workflow-registry',
      '| SORT workflow_id ASC',
      '| LIMIT 100',
      '| KEEP workflow_id, automation_level, connectors, summary',
    ].join(' '),
    columns: [
      { field: 'workflow_id', type: 'string', esType: 'keyword', label: 'Workflow' },
      { field: 'automation_level', type: 'string', esType: 'keyword', label: 'Automation' },
      { field: 'connectors', type: 'string', esType: 'keyword', label: 'Connectors' },
      { field: 'summary', type: 'string', esType: 'text', label: 'Summary' },
    ],
    grid: { x: 16, y, w: 32, h: 12 },
  })
);
y += 12;

// ─── Emit NDJSON ──────────────────────────────────────────────────────────
const dashboard = {
  id: 'soc-command-center',
  type: 'dashboard',
  typeMigrationVersion: '10.3.0',
  coreMigrationVersion: '8.8.0',
  managed: false,
  attributes: {
    title: 'Argus Command Center',
    description:
      'At-a-glance operational awareness for Argus: ' +
      'autonomy state, alert→case flow, self-governance activity, system health, ' +
      'attack simulation, and learning/evolution signals.',
    timeRestore: true,
    timeTo: 'now',
    timeFrom: 'now-24h',
    refreshInterval: { pause: false, value: 15000 },
    panelsJSON: JSON.stringify(panels),
    optionsJSON: JSON.stringify({
      useMargins: true,
      syncColors: false,
      syncTooltips: false,
      syncCursor: true,
      hidePanelTitles: false,
    }),
    kibanaSavedObjectMeta: {
      searchSourceJSON: JSON.stringify({
        query: { query: '', language: 'kuery' },
        filter: [],
      }),
    },
  },
  references: [],
};

writeFileSync(OUT, JSON.stringify(dashboard) + '\n');
console.log(`Wrote ${OUT} with ${panels.length} panels (final y=${y}).`);
