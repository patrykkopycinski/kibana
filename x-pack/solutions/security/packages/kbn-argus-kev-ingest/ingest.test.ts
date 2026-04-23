/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolingLog } from '@kbn/tooling-log';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { ingestKev, type KevEsClient } from './ingest';
import type { CisaKevFeed } from './kev_advisory';

const makeFixture = (): CisaKevFeed => ({
  title: 'CISA Catalog of Known Exploited Vulnerabilities',
  catalogVersion: '2026.04.17',
  dateReleased: '2026-04-17T00:00:00.000Z',
  count: 2,
  vulnerabilities: [
    {
      cveID: 'CVE-2026-11111',
      vendorProject: 'Acme',
      product: 'Webmail',
      vulnerabilityName: 'Acme Webmail RCE',
      dateAdded: '2026-04-17',
      shortDescription: 'Actively exploited RCE.',
      requiredAction: 'Patch.',
      dueDate: '2026-05-08',
      knownRansomwareCampaignUse: 'Known',
    },
    {
      cveID: 'CVE-2026-22222',
      vendorProject: 'Red Hat',
      product: 'Enterprise Linux',
      vulnerabilityName: 'RHEL Priv Esc',
      dateAdded: '2026-04-16',
      shortDescription: 'Local privilege escalation in a signed RHEL helper.',
      requiredAction: 'Apply vendor update.',
      dueDate: '2026-05-07',
      knownRansomwareCampaignUse: 'Unknown',
    },
  ],
});

describe('ingestKev', () => {
  const log = new ToolingLog({ level: 'silent', writeTo: process.stdout });

  it('maps and bulk-indexes the feed with advisory_id = `kev-<cve>`', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'argus-kev-'));
    const fixture = path.join(tmpDir, 'kev.json');
    await fs.writeFile(fixture, JSON.stringify(makeFixture()), 'utf8');

    const seen: unknown[] = [];
    const esClient: KevEsClient = {
      bulk: async ({ operations }) => {
        seen.push(...operations);
        return { errors: false };
      },
    };

    const result = await ingestKev({
      esClient,
      log,
      source: fixture,
      nowIso: '2026-04-17T10:00:00.000Z',
    });

    expect(result.fetched).toBe(2);
    expect(result.indexed).toBe(2);
    expect(result.index).toBe('.soc-cve-advisories');

    // Bulk API = interleaved [header, doc, header, doc, …] pairs.
    expect(seen).toHaveLength(4);
    const header0 = seen[0] as { index: { _index: string; _id: string } };
    const doc0 = seen[1] as { advisory_id: string; severity: string; ingest_run_id: string };
    expect(header0.index._id).toBe('kev-CVE-2026-11111');
    expect(doc0.advisory_id).toBe('kev-CVE-2026-11111');
    expect(doc0.severity).toBe('critical'); // known-ransomware → critical
    expect(doc0.ingest_run_id).toContain('kev-ingest-2026-04-17T10-00-00');

    const doc1 = seen[3] as { advisory_id: string; target_platforms: string[] };
    expect(doc1.advisory_id).toBe('kev-CVE-2026-22222');
    expect(doc1.target_platforms).toEqual(['linux']);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
