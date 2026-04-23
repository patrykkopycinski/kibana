#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Mine `.soc-detection-corpus` into `.soc-detection-patterns`.
 *
 * Each resulting document is a canonical detection shape for a technique,
 * with deterministic `pattern_id` (stable across runs) and aggregated
 * per-source counts. The Pareto synthesizer in
 * `@kbn/argus-exploit-to-detection` uses these patterns to seed candidate
 * generation when it sees a new advisory for the same technique.
 *
 * Idempotent: re-running against an unchanged corpus produces the same
 * pattern_ids and source_counts.
 *
 * Usage:
 *   ES_URL=http://localhost:19200 ES_AUTH=elastic:changeme \
 *     node scripts/argus_mine_patterns.js
 */

const crypto = require('node:crypto');

const DEFAULT_ES_URL = 'http://localhost:19200';
const DEFAULT_ES_AUTH = 'elastic:changeme';

const ES_URL = process.env.ES_URL || DEFAULT_ES_URL;
const ES_AUTH = process.env.ES_AUTH || DEFAULT_ES_AUTH;

const INDEX_CORPUS = '.soc-detection-corpus';
const INDEX_PATTERNS = '.soc-detection-patterns';

const CORPUS_FETCH_SIZE = 5000;

const SOURCE_KEYS = {
  sigma: 'sigma',
  'splunk-escu': 'splunk_escu',
  'elastic-prebuilt': 'elastic',
  elastic: 'elastic',
  sublime: 'sublime',
  'red-canary': 'red_canary',
  'kql-md': 'kql_md',
  crowdstrike: 'crowdstrike_cql',
};

const basicAuth = 'Basic ' + Buffer.from(ES_AUTH).toString('base64');

const esRequest = async (method, path, body) => {
  const url = `${ES_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: basicAuth,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status} ${res.statusText}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
};

const ensurePatternsIndex = async () => {
  const existsRes = await fetch(`${ES_URL}/${INDEX_PATTERNS}`, {
    method: 'HEAD',
    headers: { Authorization: basicAuth },
  });
  if (existsRes.status === 200) return;
  await esRequest('PUT', `/${INDEX_PATTERNS}`, {
    mappings: {
      properties: {
        pattern_id: { type: 'keyword' },
        technique_id: { type: 'keyword' },
        canonical_shape: { type: 'text' },
        source_counts: {
          properties: {
            sigma: { type: 'long' },
            splunk_escu: { type: 'long' },
            elastic: { type: 'long' },
            sublime: { type: 'long' },
            red_canary: { type: 'long' },
            kql_md: { type: 'long' },
            crowdstrike_cql: { type: 'long' },
          },
        },
        precision_hint: { type: 'double' },
        redundancy_groups: { type: 'keyword' },
        exemplars: { type: 'keyword' },
        computed_at: { type: 'date' },
      },
    },
  });
};

const fetchCorpus = async () => {
  const res = await esRequest('POST', `/${INDEX_CORPUS}/_search`, {
    size: CORPUS_FETCH_SIZE,
    _source: ['rule_id', 'source', 'mitre_technique'],
    query: { match_all: {} },
  });
  return (res.hits && res.hits.hits) || [];
};

const canonicalShape = (techniqueId, sourceKey) => {
  // Demo-grade canonical shape — in a real pipeline we'd tokenize the
  // underlying query. Here we hash technique × source so one technique
  // produces one pattern per source family, which gives the heatmap a
  // realistic "spans three sources" scenario.
  return `${techniqueId}::${sourceKey}`;
};

const hashPatternId = (techniqueId, shape) =>
  'pat-' +
  crypto
    .createHash('sha1')
    .update(`${techniqueId}|${shape}`)
    .digest('hex')
    .slice(0, 16);

const minePatterns = (hits) => {
  // Group corpus docs into (technique_id, source_key) buckets.
  const buckets = new Map(); // key = `${technique}::${source}` → { technique_id, shape, source_key, exemplars:[], all_sources:Set }
  const techniqueSourceTotals = new Map(); // technique_id → Map<source_key, count>

  for (const hit of hits) {
    const src = hit._source || {};
    const rawSource = src.source || 'unknown';
    const sourceKey = SOURCE_KEYS[rawSource] || rawSource.replace(/-/g, '_');
    const techniques = Array.isArray(src.mitre_technique)
      ? src.mitre_technique
      : src.mitre_technique
      ? [src.mitre_technique]
      : [];
    for (const technique of techniques) {
      if (!techniqueSourceTotals.has(technique)) {
        techniqueSourceTotals.set(technique, new Map());
      }
      const perSource = techniqueSourceTotals.get(technique);
      perSource.set(sourceKey, (perSource.get(sourceKey) || 0) + 1);

      const shape = canonicalShape(technique, sourceKey);
      const bucketKey = `${technique}::${sourceKey}`;
      let bucket = buckets.get(bucketKey);
      if (!bucket) {
        bucket = {
          technique_id: technique,
          shape,
          source_key: sourceKey,
          exemplars: [],
        };
        buckets.set(bucketKey, bucket);
      }
      if (bucket.exemplars.length < 5 && src.rule_id) {
        bucket.exemplars.push(src.rule_id);
      }
    }
  }

  // Materialise into pattern docs. Each bucket becomes one pattern;
  // source_counts aggregates *all* sources for the technique so the
  // downstream heatmap can show "this technique is covered by 3 source
  // families" at a glance.
  const patterns = [];
  for (const bucket of buckets.values()) {
    const source_counts = { sigma: 0, splunk_escu: 0, elastic: 0, sublime: 0, red_canary: 0, kql_md: 0, crowdstrike_cql: 0 };
    const perSource = techniqueSourceTotals.get(bucket.technique_id) || new Map();
    for (const [k, v] of perSource.entries()) {
      if (source_counts[k] !== undefined) source_counts[k] += v;
    }
    patterns.push({
      id: hashPatternId(bucket.technique_id, bucket.shape),
      pattern_id: hashPatternId(bucket.technique_id, bucket.shape),
      technique_id: bucket.technique_id,
      canonical_shape: bucket.shape,
      source_counts,
      precision_hint: null,
      redundancy_groups: [],
      exemplars: bucket.exemplars.slice(0, 5),
      computed_at: new Date().toISOString(),
    });
  }
  return patterns;
};

const bulkIndex = async (indexName, docs) => {
  if (docs.length === 0) return;
  const lines = [];
  for (const doc of docs) {
    const { id, ...rest } = doc;
    lines.push(JSON.stringify({ index: { _index: indexName, _id: id } }));
    lines.push(JSON.stringify(rest));
  }
  const body = lines.join('\n') + '\n';
  const res = await fetch(`${ES_URL}/_bulk?refresh=wait_for`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-ndjson',
      Authorization: basicAuth,
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`bulk index ${indexName} failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  if (json.errors) {
    const failed = json.items.filter((i) => {
      const op = Object.values(i)[0];
      return op && op.error;
    });
    throw new Error(
      `bulk ${indexName} had ${failed.length} failures: ${JSON.stringify(failed.slice(0, 3))}`
    );
  }
};

const main = async () => {
  console.log(`[argus_mine_patterns] ES_URL=${ES_URL}`);
  await ensurePatternsIndex();
  const hits = await fetchCorpus();
  console.log(`  corpus docs fetched: ${hits.length}`);
  const patterns = minePatterns(hits);
  console.log(`  patterns mined: ${patterns.length}`);
  await bulkIndex(INDEX_PATTERNS, patterns);
  console.log(`  ${INDEX_PATTERNS}: ${patterns.length} docs upserted`);
  console.log('[argus_mine_patterns] done');
};

main().catch((err) => {
  console.error('[argus_mine_patterns] fatal:', err.message);
  process.exit(1);
});
