/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import fs from 'fs/promises';
import type { CisaKevFeed } from './kev_advisory';

/**
 * Canonical CISA KEV JSON feed. CISA guarantees this URL is stable and
 * updated on every catalog release, so we embed it here rather than through
 * a config flag — the CLI still accepts `--source` to override for testing.
 */
export const DEFAULT_CISA_KEV_URL =
  'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';

/** Minimal shape of what we accept as the JSON body. */
const isFeed = (x: unknown): x is CisaKevFeed =>
  !!x && typeof x === 'object' && Array.isArray((x as CisaKevFeed).vulnerabilities);

/**
 * Fetch the KEV feed. Accepts either an HTTPS URL or a local file path (the
 * latter is useful for offline demos and for the jest test that avoids
 * reaching out to CISA from CI). Throws on non-200 HTTP responses and on
 * malformed payloads — fail-loud, never silently ingest an empty catalog.
 */
export const fetchCisaKevFeed = async (
  source: string = DEFAULT_CISA_KEV_URL
): Promise<CisaKevFeed> => {
  const body =
    source.startsWith('http://') || source.startsWith('https://')
      ? await readHttp(source)
      : await fs.readFile(source, 'utf8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    throw new Error(`KEV feed at ${source} did not parse as JSON: ${(err as Error).message}`);
  }
  if (!isFeed(parsed)) {
    throw new Error(`KEV feed at ${source} is missing the required \`vulnerabilities\` array.`);
  }
  return parsed;
};

const readHttp = async (url: string): Promise<string> => {
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`KEV feed fetch failed: ${res.status} ${res.statusText} from ${url}`);
  }
  return res.text();
};
