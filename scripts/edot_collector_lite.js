/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Lightweight OTLP/HTTP-to-Elasticsearch trace collector.
 *
 * Drop-in replacement for the Docker-based EDOT collector on hosts without
 * Docker (e.g. kibana-i9). Listens on :4318, accepts OTLP/HTTP JSON trace
 * batches, and indexes them as documents into the local Scout Elasticsearch.
 *
 * This is intentionally minimal — it parses OTLP JSON, flattens spans into
 * documents with the fields the trace-based evaluators query (trace_id,
 * span_id, attributes.*, etc.), and bulk-indexes into `traces-apm-default`.
 *
 * Usage:
 *   ELASTICSEARCH_HOST=http://127.0.0.1:15000 node scripts/edot_collector_lite.js
 *
 * The evaluators query `FROM traces-*` which matches the indices this bridge
 * writes to.
 */

const http = require('http');
const { Client } = require('@elastic/elasticsearch');

const ES_HOST = process.env.ELASTICSEARCH_HOST || 'http://127.0.0.1:15000';
const ES_USER = 'elastic';
const ES_PASS = 'changeme';
const PORT = parseInt(process.env.EDOT_LITE_PORT || '4318', 10);
const INDEX_PREFIX = 'traces-apm-default';

// DEV ONLY: Scout ES uses self-signed certs on local dev machines. This
// collector runs on localhost and connects only to the ephemeral local
// Scout ES instance, never to production clusters. Adding a CA trust store
// for a per-run ephemeral cert that's regenerated on every boot is not
// practical.
const esClient = new Client({
  node: ES_HOST,
  auth: { username: ES_USER, password: ES_PASS },
  tls: { rejectUnauthorized: false },
});

/**
 * Convert an OTLP/HTTP JSON trace batch to ES bulk index operations.
 * Each span becomes one document in traces-apm-default.
 */
function otlpToEsDocs(body) {
  const docs = [];
  const batch = typeof body === 'string' ? JSON.parse(body) : body;
  const resourceSpans = batch.resourceSpans || [];

  for (const rs of resourceSpans) {
    const resourceAttrs = {};
    for (const a of rs.resource?.attributes || []) {
      resourceAttrs[a.key] =
        a.value?.stringValue || a.value?.intValue || a.value?.doubleValue || a.value?.boolValue;
    }

    for (const ss of rs.scopeSpans || []) {
      for (const span of ss.spans || []) {
        const attrs = {};
        for (const a of span.attributes || []) {
          let val =
            a.value?.stringValue || a.value?.intValue || a.value?.doubleValue || a.value?.boolValue;
          if (val === undefined && a.value?.arrayValue) {
            val = a.value.arrayValue.values
              ?.map((v) => v.stringValue || v.intValue || v.doubleValue || v.boolValue)
              .join(',');
          }
          attrs[a.key] = val;
        }

        // Map OTLP field names to what the evaluators query:
        // - trace_id (the factory.ts evaluator queries trace_id)
        // - trace.id (the evaluate_dataset.ts ExpectedSkillInvocation queries trace.id)
        // Include BOTH so both evaluator code paths work regardless of drift
        docs.push({
          trace_id: span.traceId,
          'trace.id': span.traceId,
          span_id: span.spanId,
          parent_span_id: span.parentSpanId || null,
          name: span.name,
          kind: span.kind,
          start_time_unix_nano: span.startTimeUnixNano,
          end_time_unix_nano: span.endTimeUnixNano,
          duration_ms:
            span.endTimeUnixNano && span.startTimeUnixNano
              ? Math.round((Number(span.endTimeUnixNano) - Number(span.startTimeUnixNano)) / 1e6)
              : null,
          status_code: span.status?.code || null,
          status_message: span.status?.message || null,
          resource: resourceAttrs,
          attributes: attrs,
          // Flatten key attributes for ES|QL WHERE clauses
          'attributes.gen_ai.tool.name':
            attrs['gen_ai.tool.name'] || attrs['attributes.gen_ai.tool.name'] || null,
          'attributes.elastic.inference.span.kind': attrs['elastic.inference.span.kind'] || null,
          'attributes.gen_ai.usage.input_tokens': attrs['gen_ai.usage.input_tokens'] || null,
          'attributes.gen_ai.usage.output_tokens': attrs['gen_ai.usage.output_tokens'] || null,
          '@timestamp': span.startTimeUnixNano
            ? new Date(Number(span.startTimeUnixNano) / 1e6).toISOString()
            : new Date().toISOString(),
        });
      }
    }
  }

  return docs;
}

// Buffer for traces that arrive before ES is ready.
// The lite collector often starts before Scout ES finishes booting.
// Without buffering, these traces are permanently lost.
let traceBuffer = [];
const MAX_BUFFER = 5000;
let esReady = false;
let esChecking = false;

async function checkEsReady() {
  if (esReady) return true;
  if (esChecking) return false;
  esChecking = true;
  try {
    await esClient.ping();
    // Kibana's native ElasticsearchOtlpExporter (activated whenever
    // agentBuilder:tracing:enabled=true) writes gen_ai spans directly to
    // .ds-traces-agent_builder.otel-default-* with trace_id mapped as
    // `keyword`. If this bridge's traces-apm-default is left on ES's
    // dynamic-mapping default (`text`), evaluators querying `FROM traces-*`
    // hit a cross-index type conflict: verification_exception "Cannot use
    // field [trace_id] due to ambiguities ... [keyword] ... [text]". Install
    // an explicit component template BEFORE any doc is indexed so trace_id
    // gets the same `keyword` type as the native exporter's stream.
    await ensureTraceIdKeywordMapping();
    esReady = true;
    console.error(`[edot-lite] ES connection established`);
    // Flush any buffered traces
    if (traceBuffer.length > 0) {
      console.error(`[edot-lite] Flushing ${traceBuffer.length} buffered trace docs`);
      const buffered = traceBuffer.splice(0);
      await indexDocsNow(buffered);
    }
  } catch (err) {
    esReady = false;
  }
  esChecking = false;
  return esReady;
}

/**
 * Ensures trace_id/span_id/parent_span_id and every attributes.* string field
 * are mapped as `keyword`, matching Kibana's native ElasticsearchOtlpExporter
 * output index (.ds-traces-agent_builder.otel-default-*). That exporter
 * activates automatically whenever agentBuilder:tracing:enabled=true and
 * writes gen_ai.* spans straight to ES with keyword-typed string attributes.
 * Evaluators query `FROM traces-*` (a wildcard spanning both indices), so any
 * attributes.* field left on ES's dynamic-mapping default (`text`) causes a
 * cross-index verification_exception the moment that field is queried —
 * observed for trace_id, then attributes.elastic.inference.span.kind, and
 * will recur for any other new gen_ai.* attribute Kibana adds later.
 *
 * A dynamic_template (rather than a hardcoded property list) makes this
 * future-proof: every attributes.* string field is keyword-mapped by
 * default, matching upstream's convention, without needing to enumerate
 * or track new attribute names as they're added.
 *
 * Idempotent — safe to call on every boot. Installed as a component +
 * index template so the mapping applies before the first document lands,
 * pre-empting ES's dynamic-mapping inference.
 */
async function ensureTraceIdKeywordMapping() {
  const componentTemplateName = 'edot-lite-trace-id-keyword';
  const indexTemplateName = 'edot-lite-traces-apm';
  try {
    await esClient.cluster.putComponentTemplate({
      name: componentTemplateName,
      body: {
        template: {
          mappings: {
            properties: {
              trace_id: { type: 'keyword' },
              span_id: { type: 'keyword' },
              parent_span_id: { type: 'keyword' },
              // ECS-style `trace.id`/`span.id` (dotted, nested object) alias
              // straight to the OTel-style `trace_id`/`span_id` keyword fields
              // above — matches how Kibana's native ElasticsearchOtlpExporter
              // maps `.ds-traces-agent_builder.otel-default-*` (confirmed via
              // `GET <otel-index>/_mapping/field/trace.id` returning
              // `{"type":"alias","path":"trace_id"}`). Without this, ES's
              // dynamic mapping falls back to the ECS `traces-apm@template`
              // (priority 210), which maps `trace.id`/`span.id` as `text`,
              // and evaluators doing `WHERE trace.id == "..."` hit the same
              // cross-index verification_exception the `trace_id` fix above
              // was for — just on the dotted alias instead of the raw field.
              trace: {
                properties: {
                  id: { type: 'alias', path: 'trace_id' },
                },
              },
              span: {
                properties: {
                  id: { type: 'alias', path: 'span_id' },
                },
              },
            },
            dynamic_templates: [
              {
                attributes_strings_as_keyword: {
                  path_match: 'attributes.*',
                  match_mapping_type: 'string',
                  mapping: { type: 'keyword' },
                },
              },
            ],
          },
        },
      },
    });
    await esClient.indices.putIndexTemplate({
      name: indexTemplateName,
      body: {
        index_patterns: [INDEX_PREFIX],
        composed_of: [componentTemplateName],
        priority: 500,
      },
    });
  } catch (err) {
    console.error(`[edot-lite] WARNING: failed to install trace_id keyword mapping template: ${err.message}`);
  }
}

async function indexDocsNow(docs) {
  if (docs.length === 0) return;

  const body = [];
  for (const doc of docs) {
    body.push({ create: { _index: INDEX_PREFIX } });
    body.push(doc);
  }

  const result = await esClient.bulk({ body, refresh: false });

  if (result.errors) {
    const failed = result.items.filter((item) => item.create?.error);
    if (failed.length > 0) {
      console.error(`[edot-lite] ${failed.length}/${docs.length} docs failed to index`);
      console.error(`[edot-lite] first error: ${JSON.stringify(failed[0].create?.error?.reason)}`);
    }
  }
}

async function indexDocs(docs) {
  if (docs.length === 0) return;

  if (!esReady) {
    // Buffer traces until ES is ready
    traceBuffer.push(...docs);
    if (traceBuffer.length > MAX_BUFFER) {
      traceBuffer = traceBuffer.slice(-MAX_BUFFER);
      console.error(`[edot-lite] Buffer full, keeping last ${MAX_BUFFER} trace docs`);
    }
    // Try to establish connection (non-blocking, throttled by esChecking)
    checkEsReady().catch(() => {});
    return;
  }

  try {
    await indexDocsNow(docs);
  } catch (err) {
    console.error(`[edot-lite] bulk index error: ${err.message}`);
    esReady = false;
    // Re-buffer the docs for retry
    traceBuffer.push(...docs);
    if (traceBuffer.length > MAX_BUFFER) {
      traceBuffer = traceBuffer.slice(-MAX_BUFFER);
    }
  }
}

// Start background connectivity checker — pings ES every 5s until ready
const esCheckInterval = setInterval(() => {
  if (!esReady) {
    checkEsReady().catch(() => {});
  }
}, 5000);

const server = http.createServer((req, res) => {
  // Health check
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'edot-collector-lite' }));
    return;
  }

  // OTLP/HTTP expects POST /v1/traces with JSON body
  if (req.method === 'POST' && req.url === '/v1/traces') {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', async () => {
      try {
        const docs = otlpToEsDocs(data);
        if (docs.length > 0) {
          await indexDocs(docs);
        }
        // OTLP/HTTP spec: return 200 with empty body
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
      } catch (err) {
        console.error(`[edot-lite] parse/index error: ${err.message}`);
        // Still return 200 — OTLP collectors don't reject batches on errors,
        // they log and drop. This prevents the exporter from retrying.
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
      }
    });
    return;
  }

  // Reject GET on /v1/traces with 405 (matches EDOT behavior for health checks)
  if (req.method === 'GET' && req.url === '/v1/traces') {
    res.writeHead(405);
    res.end();
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[edot-lite] OTLP HTTP collector listening on http://127.0.0.1:${PORT}`);
  console.log(`[edot-lite] Exporting traces to ES at ${ES_HOST}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  clearInterval(esCheckInterval);
  server.close();
  process.exit(0);
});
process.on('SIGINT', () => {
  clearInterval(esCheckInterval);
  server.close();
  process.exit(0);
});
