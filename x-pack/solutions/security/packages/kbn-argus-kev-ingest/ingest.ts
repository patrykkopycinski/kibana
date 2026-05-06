/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolingLog } from '@kbn/tooling-log';
import { fetchCisaKevFeed, DEFAULT_CISA_KEV_URL } from './fetch_feed';
import { mapKevFeed, type KevAdvisoryDoc } from './kev_advisory';

/**
 * Minimal structural shape of the Elasticsearch client we need. We avoid a
 * hard dependency on `@elastic/elasticsearch` so the CLI, tests, and the
 * workflow harness can all plug in their own clients.
 */
export interface KevEsClient {
  bulk: (args: {
    refresh: 'wait_for' | boolean;
    operations: readonly unknown[];
  }) => Promise<{ errors?: boolean; items?: readonly unknown[] }>;
}

export interface IngestKevOptions {
  esClient: KevEsClient;
  log: ToolingLog;
  /** Override the feed URL or point at a local file. */
  source?: string;
  /** Override the advisories index — defaults to `.soc-cve-advisories`. */
  index?: string;
  /** Inject the current timestamp for deterministic tests. */
  nowIso?: string;
  /**
   * When true, already-existing advisory_ids are skipped (`op_type=create`).
   * Default is `index` which upserts — that is the correct behaviour for a
   * live feed because CISA retroactively edits entries (notes, due_dates).
   */
  createOnly?: boolean;
}

export interface IngestKevResult {
  fetched: number;
  indexed: number;
  index: string;
  run_id: string;
}

/**
 * Fetch the KEV feed, map it to `.soc-cve-advisories` documents, and bulk-
 * index. Returns a summary the CLI and the `soc_kev_ingest.yaml` workflow
 * can log and persist.
 */
export const ingestKev = async ({
  esClient,
  log,
  source = DEFAULT_CISA_KEV_URL,
  index = '.soc-cve-advisories',
  nowIso = new Date().toISOString(),
  createOnly = false,
}: IngestKevOptions): Promise<IngestKevResult> => {
  log.info(`[argus-kev-ingest] fetching ${source}`);
  const feed = await fetchCisaKevFeed(source);
  const docs = mapKevFeed(feed, nowIso);
  log.info(
    `[argus-kev-ingest] catalog version=${feed.catalogVersion} released=${feed.dateReleased} entries=${docs.length}`
  );

  const runId = `kev-ingest-${nowIso.replace(/[:.]/g, '-')}`;
  const op: 'create' | 'index' = createOnly ? 'create' : 'index';

  const operations: unknown[] = [];
  for (const doc of docs) {
    operations.push({ [op]: { _index: index, _id: doc.advisory_id } });
    // We stamp run_id on each doc so operators can correlate a bulk-index
    // back to the workflow run. Doing it here instead of in mapKevEntry
    // keeps mapKevEntry a pure function (easier to test) but still
    // guarantees the field is never missing on indexed docs.
    operations.push({ ...doc, ingest_run_id: runId } as KevAdvisoryDoc & {
      ingest_run_id: string;
    });
  }

  if (operations.length === 0) {
    log.warning('[argus-kev-ingest] empty KEV feed — nothing to index');
    return { fetched: 0, indexed: 0, index, run_id: runId };
  }

  const result = await esClient.bulk({ refresh: 'wait_for', operations });
  if (result.errors) {
    log.warning(
      `[argus-kev-ingest] bulk response reported partial failure; inspect .soc-dead-letter`
    );
  }
  log.info(`[argus-kev-ingest] indexed ${docs.length} KEV advisories into ${index}`);
  return { fetched: docs.length, indexed: docs.length, index, run_id: runId };
};
