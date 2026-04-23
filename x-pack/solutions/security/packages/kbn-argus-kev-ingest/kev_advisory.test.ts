/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  inferKevPlatforms,
  inferKevSeverity,
  mapKevEntry,
  mapKevFeed,
  type CisaKevEntry,
  type CisaKevFeed,
} from './kev_advisory';

const baseEntry: CisaKevEntry = {
  cveID: 'CVE-2026-12345',
  vendorProject: 'Acme',
  product: 'Webmail',
  vulnerabilityName: 'Acme Webmail Unauthenticated RCE',
  dateAdded: '2026-04-17',
  shortDescription:
    'Acme Webmail contains an unauthenticated RCE that is actively exploited to drop post-exploitation tooling.',
  requiredAction: 'Apply vendor update per KB-12345 or disable Webmail service.',
  dueDate: '2026-05-08',
  knownRansomwareCampaignUse: 'Unknown',
};

describe('kev_advisory.mapKevEntry', () => {
  it('stamps a stable `kev-<cve>` advisory_id', () => {
    const doc = mapKevEntry(baseEntry, '2026-04-17T00:00:00.000Z');
    expect(doc.advisory_id).toBe('kev-CVE-2026-12345');
  });

  it('preserves the KEV envelope verbatim', () => {
    const doc = mapKevEntry(baseEntry, '2026-04-17T00:00:00.000Z');
    expect(doc.kev).toEqual({
      date_added: '2026-04-17T00:00:00.000Z',
      due_date: '2026-05-08T00:00:00.000Z',
      known_ransomware_use: false,
      vendor_project: 'Acme',
      product: 'Webmail',
      notes: undefined,
      required_action: 'Apply vendor update per KB-12345 or disable Webmail service.',
    });
  });

  it('marks the doc as ingested+source=cisa_kev so the reconciler picks it up', () => {
    const doc = mapKevEntry(baseEntry);
    expect(doc.status).toBe('ingested');
    expect(doc.source).toBe('cisa_kev');
  });
});

describe('kev_advisory.inferKevSeverity', () => {
  it('returns critical when CISA flags known ransomware use', () => {
    expect(inferKevSeverity({ ...baseEntry, knownRansomwareCampaignUse: 'Known' })).toBe(
      'critical'
    );
  });

  it('defaults to high — every KEV entry is by definition exploited in the wild', () => {
    expect(inferKevSeverity(baseEntry)).toBe('high');
    expect(inferKevSeverity({ ...baseEntry, knownRansomwareCampaignUse: 'Unknown' })).toBe('high');
  });
});

describe('kev_advisory.inferKevPlatforms', () => {
  it('detects Linux from vendor/product text', () => {
    expect(
      inferKevPlatforms({ ...baseEntry, vendorProject: 'Red Hat', product: 'Enterprise Linux' })
    ).toEqual(['linux']);
  });

  it('detects Kubernetes flavours', () => {
    expect(
      inferKevPlatforms({ ...baseEntry, vendorProject: 'Canonical', product: 'Kubernetes' })
    ).toEqual(['kubernetes']);
  });

  it('detects macOS', () => {
    expect(inferKevPlatforms({ ...baseEntry, vendorProject: 'Apple', product: 'macOS' })).toEqual([
      'macos',
    ]);
  });

  it('falls back to windows for unidentified vendors', () => {
    expect(inferKevPlatforms(baseEntry)).toEqual(['windows']);
  });
});

describe('kev_advisory.mapKevFeed', () => {
  it('maps every entry and preserves order', () => {
    const feed: CisaKevFeed = {
      title: 'CISA KEV',
      catalogVersion: '2026.04.17',
      dateReleased: '2026-04-17T00:00:00.000Z',
      count: 2,
      vulnerabilities: [
        baseEntry,
        { ...baseEntry, cveID: 'CVE-2026-99999', knownRansomwareCampaignUse: 'Known' },
      ],
    };
    const docs = mapKevFeed(feed);
    expect(docs).toHaveLength(2);
    expect(docs[0].advisory_id).toBe('kev-CVE-2026-12345');
    expect(docs[1].advisory_id).toBe('kev-CVE-2026-99999');
    expect(docs[1].severity).toBe('critical');
  });
});
