/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Golden OTLP trace capture for Daybreak AD + forensic worker paths.
 *
 * Preflights TRACING_ES_URL, exercises:
 *   1. AD adapter (from-attack-discovery) + AD-shaped agent converse (OTLP)
 *   2. Forensic worker (run-forensic workflow)
 * Polls traces-agent_builder.otel-default and writes evidence JSON.
 *
 * Usage (from Kibana repo root, Kibana on :5631 with telemetry.tracing enabled):
 *   TRACING_ES_URL=http://elastic:changeme@localhost:15000 \
 *   KIBANA_URL=http://localhost:5631 \
 *   node x-pack/solutions/security/plugins/daybreak/scripts/capture_golden_otlp_traces.mjs
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(__dirname, '..');
const KIBANA_ROOT = path.resolve(PLUGIN_ROOT, '../../../../..');

const KIBANA_URL = (process.env.KIBANA_URL ?? 'http://localhost:5631').replace(/\/$/, '');
const TRACING_ES_URL = (process.env.TRACING_ES_URL ?? 'http://elastic:changeme@localhost:15000').replace(
  /\/$/,
  ''
);
const OTLP_HTTP_URL = process.env.OTLP_HTTP_URL ?? 'http://localhost:4318/v1/traces';
const TRACE_INDEX = process.env.TRACE_INDEX ?? 'traces-agent_builder.otel-default';
const USERNAME = process.env.ELASTICSEARCH_USERNAME ?? process.env.KIBANA_USERNAME ?? 'elastic';
const PASSWORD = process.env.ELASTICSEARCH_PASSWORD ?? process.env.KIBANA_PASSWORD ?? 'changeme';
const API_BASE = `${KIBANA_URL}/api/daybreak`;
const AGENT_ID = 'daybreak-alert-analysis-agent';
const POLL_TIMEOUT_MS = Number(process.env.TRACE_POLL_TIMEOUT_MS ?? 120_000);
const POLL_INTERVAL_MS = Number(process.env.TRACE_POLL_INTERVAL_MS ?? 5_000);
const MIN_SPANS = Number(process.env.TRACE_MIN_SPANS ?? 1);

const authHeader = `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64')}`;
const kibanaHeaders = {
  Authorization: authHeader,
  'kbn-xsrf': 'true',
  'x-elastic-internal-origin': 'Kibana',
  'Content-Type': 'application/json',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseEsUrl = (url) => {
  const parsed = new URL(url);
  return {
    base: `${parsed.protocol}//${parsed.host}`,
    auth: parsed.username
      ? `Basic ${Buffer.from(`${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password)}`).toString('base64')}`
      : authHeader,
  };
};

const es = parseEsUrl(TRACING_ES_URL);

const esRequest = async (method, pathSuffix, body) => {
  const init = {
    method,
    headers: { Authorization: es.auth, 'Content-Type': 'application/json' },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`${es.base}${pathSuffix}`, init);
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = { raw: text };
  }
  return { status: response.status, ok: response.ok, json };
};

const kibanaRequest = async (method, url, body) => {
  const init = { method, headers: { ...kibanaHeaders } };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const response = await fetch(url, init);
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = { raw: text };
  }
  return { status: response.status, ok: response.ok, json };
};

const preflight = async () => {
  const checks = [];

  const health = await esRequest('GET', '/_cluster/health');
  checks.push({
    name: 'tracing_es_health',
    passed: health.ok && health.json?.status !== 'red',
    detail: health.json?.status ?? `status=${health.status}`,
  });

  const count = await esRequest('GET', `/${TRACE_INDEX}/_count`);
  checks.push({
    name: 'tracing_index_reachable',
    passed: count.ok,
    detail: count.ok ? `docs=${count.json?.count ?? 0}` : `status=${count.status}`,
  });

  let otlpOk = false;
  try {
    const otlp = await fetch(OTLP_HTTP_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '[]' });
    otlpOk = otlp.status === 200 || otlp.status === 400 || otlp.status === 405;
    checks.push({ name: 'otlp_collector', passed: otlpOk, detail: `http=${otlp.status}` });
  } catch (err) {
    checks.push({ name: 'otlp_collector', passed: false, detail: String(err) });
  }

  const status = await kibanaRequest('GET', `${KIBANA_URL}/api/status`);
  checks.push({
    name: 'kibana_reachable',
    passed: status.ok,
    detail: status.json?.status?.overall?.level ?? `status=${status.status}`,
  });

  let kibanaUuid = status.json?.status?.core?.uuid ?? process.env.KIBANA_UUID;
  if (!kibanaUuid) {
    try {
      const log = readFileSync('/private/tmp/kibana-daybreak-spike.log', 'utf8');
      const match = log.match(/Kibana UUID: ([0-9a-f-]{36})/i);
      if (match) {
        kibanaUuid = match[1];
      }
    } catch {
      // optional — dev /api/status may omit core.uuid
    }
  }

  const failed = checks.filter((c) => !c.passed);
  return { checks, passed: failed.length === 0, kibanaUuid };
};

const getTraceWatermark = async () => {
  const result = await esRequest('POST', `/${TRACE_INDEX}/_search`, {
    size: 1,
    sort: [{ '@timestamp': 'desc' }],
    query: { match_all: {} },
    _source: ['@timestamp', 'trace.id'],
  });
  const hit = result.json?.hits?.hits?.[0];
  return {
    timestamp: hit?._source?.['@timestamp'] ?? '1970-01-01T00:00:00.000Z',
    traceId: hit?._source?.trace?.id,
  };
};

const summarizeSpan = (source) => ({
  timestamp: source['@timestamp'],
  traceId: source.trace?.id ?? source['trace.id'],
  spanId: source.span?.id ?? source['span.id'],
  name: source.name,
  kind: source.kind,
  durationNs: source.duration,
  findingType: source.attributes?.['gen_ai.tool.name'] ?? source.attributes?.['elastic.inference.span.kind'],
  model: source.attributes?.['gen_ai.request.model'],
  inputTokens: source.attributes?.['gen_ai.usage.input_tokens'],
  outputTokens: source.attributes?.['gen_ai.usage.output_tokens'],
  skillName: source.attributes?.['gen_ai.tool.name'],
});

const fetchSpansAfter = async (sinceIso, kibanaUuid) => {
  const must = [{ range: { '@timestamp': { gt: sinceIso } } }];
  if (kibanaUuid) {
    must.push({ term: { 'resource.attributes.kibana_uuid': kibanaUuid } });
  }

  const result = await esRequest('POST', `/${TRACE_INDEX}/_search`, {
    size: 50,
    sort: [{ '@timestamp': 'asc' }],
    query: { bool: { must } },
  });

  const hits = result.json?.hits?.hits ?? [];
  return hits.map((hit) => summarizeSpan(hit._source ?? {}));
};

const pollForSpans = async (sinceIso, kibanaUuid) => {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const spans = await fetchSpansAfter(sinceIso, kibanaUuid);
    if (spans.length >= MIN_SPANS) {
      return spans;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return fetchSpansAfter(sinceIso, kibanaUuid);
};

const fetchSpansByTraceIds = async (traceIds) => {
  const ids = [...new Set(traceIds.filter(Boolean))];
  if (ids.length === 0) {
    return [];
  }
  const result = await esRequest('POST', `/${TRACE_INDEX}/_search`, {
    size: 50,
    sort: [{ '@timestamp': 'asc' }],
    query: { terms: { 'trace.id': ids } },
  });
  const hits = result.json?.hits?.hits ?? [];
  return hits.map((hit) => summarizeSpan(hit._source ?? {}));
};

const pollForTraceIds = async (traceIds) => {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const spans = await fetchSpansByTraceIds(traceIds);
    if (spans.length >= MIN_SPANS) {
      return spans;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return fetchSpansByTraceIds(traceIds);
};

const runAdPaths = async () => {
  const proposalId = `ad-otlp-${Date.now()}`;
  const adapter = await kibanaRequest('POST', `${API_BASE}/proposals/from-attack-discovery`, {
    proposalId,
    ad: {
      id: 'ad-bh-001',
      title: 'False-positive prone PowerShell admin cluster (AD 9.5 path)',
      description:
        'Attack Discovery correlated scheduled-task PowerShell on finance workstations with prior benign admin context.',
      severity: 'medium',
      confidence: 0.91,
      tactics: ['execution'],
      relatedAlertIds: ['alert-ps-finance-014', 'alert-sched-task-022'],
      triageStatus: 'open',
    },
  });

  const adInput =
    'Attack Discovery reports a false-positive prone PowerShell admin cluster on finance workstations. ' +
    'Produce a structured triage verdict JSON with verdict, confidence, and rationale fields.';

  const converse = await kibanaRequest('POST', `${KIBANA_URL}/api/agent_builder/converse`, {
    agent_id: AGENT_ID,
    input: adInput,
  });

  return {
    adapter: {
      passed: adapter.ok && adapter.json?.id === proposalId,
      proposalId,
      capability: adapter.json?.capability,
      status: adapter.status,
    },
    agentConverse: {
      passed: converse.ok,
      status: converse.status,
      traceId: converse.json?.trace_id,
      messagePreview: converse.json?.response?.message?.slice(0, 200),
    },
  };
};

const runForensicPath = async () => {
  const investigationId = 'investigation-demo-proposal-5';
  const run = await kibanaRequest('POST', `${API_BASE}/investigations/${investigationId}/run-forensic`, {
    hosts: ['FIN-WS-09'],
    timeWindowHours: 72,
  });

  const forensic = await kibanaRequest('POST', `${API_BASE}/investigations/${investigationId}/forensic`, {
    hosts: ['FIN-WS-09'],
    timeWindowHours: 72,
  });

  return {
    runForensic: {
      passed: run.ok && Boolean(run.json?.workflowExecutionId),
      workflowExecutionId: run.json?.workflowExecutionId,
      status: run.status,
    },
    forensicStub: {
      passed: forensic.ok,
      stub: forensic.json?.toolResult?.stub === true || forensic.json?.stub === true,
      status: forensic.status,
    },
  };
};

const main = async () => {
  console.log(`[otlp-capture] Kibana=${KIBANA_URL} TRACING_ES_URL=${es.base}`);

  const pre = await preflight();
  for (const check of pre.checks) {
    console.log(`[otlp-capture] ${check.passed ? 'PASS' : 'FAIL'} ${check.name} — ${check.detail}`);
  }
  if (!pre.passed) {
    console.error('[otlp-capture] Preflight failed — fix TRACING_ES_URL / OTLP collector / Kibana tracing config.');
    process.exit(1);
  }

  const captureStartedAt = new Date().toISOString();
  const watermark = await getTraceWatermark();
  console.log(
    `[otlp-capture] Watermark @timestamp=${watermark.timestamp} captureStartedAt=${captureStartedAt}`
  );

  const ad = await runAdPaths();
  console.log(
    `[otlp-capture] AD adapter ${ad.adapter.passed ? 'PASS' : 'FAIL'} proposal=${ad.adapter.proposalId}; ` +
      `converse ${ad.agentConverse.passed ? 'PASS' : 'FAIL'} traceId=${ad.agentConverse.traceId ?? 'n/a'}`
  );

  const forensic = await runForensicPath();
  console.log(
    `[otlp-capture] Forensic worker ${forensic.runForensic.passed ? 'PASS' : 'FAIL'} ` +
      `execution=${forensic.runForensic.workflowExecutionId ?? 'n/a'}`
  );

  const candidateTraceIds = [ad.agentConverse.traceId].filter(Boolean);
  let spans = await pollForTraceIds(candidateTraceIds);
  if (spans.length < MIN_SPANS) {
    console.log('[otlp-capture] trace_id poll empty — falling back to post-capture timestamp window');
    spans = await pollForSpans(captureStartedAt, undefined);
  }
  const llmSpans = spans.filter((s) => s.model || s.name?.includes('chat'));
  const traceIds = [...new Set(spans.map((s) => s.traceId).filter(Boolean))];

  const report = {
    generatedAt: new Date().toISOString(),
    milestone: 'full-mvp-october-2026',
    preflight: pre.checks,
    tracingEsUrl: es.base,
    otlpHttpUrl: OTLP_HTTP_URL,
    traceIndex: TRACE_INDEX,
    kibanaUuid: pre.kibanaUuid,
    watermark,
    captureStartedAt,
    paths: { ad, forensic },
    capture: {
      spanCount: spans.length,
      llmSpanCount: llmSpans.length,
      traceIds,
      spans: spans.slice(0, 20),
    },
    gatePassed:
      ad.adapter.passed &&
      ad.agentConverse.passed &&
      forensic.runForensic.passed &&
      spans.length >= MIN_SPANS &&
      llmSpans.length >= 1,
  };

  const dataDir = path.join(KIBANA_ROOT, 'data');
  mkdirSync(dataDir, { recursive: true });
  const outPath = path.join(dataDir, 'daybreak-golden-otlp-traces.json');
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[otlp-capture] Wrote ${outPath}`);
  console.log(
    `[otlp-capture] spans=${report.capture.spanCount} llmSpans=${report.capture.llmSpanCount} ` +
      `traceIds=${traceIds.length}`
  );

  if (!report.gatePassed) {
    console.error('[otlp-capture] FAIL — insufficient OTLP evidence (enable telemetry.tracing on Kibana :5631).');
    process.exit(1);
  }
  console.log('[otlp-capture] PASS — golden OTLP capture green');
};

main().catch((err) => {
  console.error('[otlp-capture] Unhandled error:', err);
  process.exit(1);
});
