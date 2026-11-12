/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadDetonateCorpus, upperBound95 } from './corpus';

describe('upperBound95', () => {
  it('is ≤1% for 0 failures on ≥300 (the O10 criterion)', () => {
    expect(upperBound95(0, 300)).toBeLessThanOrEqual(0.01);
    expect(upperBound95(0, 304)).toBeCloseTo(0.00981, 4);
  });

  it('is above 1% for 0 failures on fewer than 299', () => {
    expect(upperBound95(0, 250)).toBeGreaterThan(0.01);
  });

  it('exceeds the observed rate when there are failures', () => {
    expect(upperBound95(3, 300)).toBeGreaterThan(0.01);
  });
});

describe('loadDetonateCorpus', () => {
  it('loads the committed corpus with ≥300 known-good entries and valid labels', () => {
    const corpus = loadDetonateCorpus();
    const count = (label: string) => corpus.filter((e) => e.label === label).length;
    expect(count('known_good_benign')).toBeGreaterThanOrEqual(300);
    expect(count('known_malicious')).toBeGreaterThan(0);
    expect(count('evasive_no_alerts')).toBeGreaterThan(0);
    expect(new Set(corpus.map((e) => e.id)).size).toBe(corpus.length);
  });

  it('loads a legacy known_good_quiet entry as known_good_benign', () => {
    const benign = loadDetonateCorpus().find((e) => e.label === 'known_good_benign');
    if (!benign) throw new Error('committed corpus has no known_good_benign entry');
    const dir = mkdtempSync(join(tmpdir(), 'detonate-corpus-'));
    const path = join(dir, 'legacy.json');
    writeFileSync(
      path,
      JSON.stringify({
        generatedAt: 'legacy',
        note: 'legacy label',
        counts: {},
        entries: [{ id: 'legacy-1', label: 'known_good_quiet', task: benign.task }],
      })
    );

    expect(loadDetonateCorpus(path).map((e) => e.label)).toEqual(['known_good_benign']);
  });

  it('names only the neutral sandbox host and policy in recorded alert docs', () => {
    const hosts = new Set<string>();
    const policies = new Set<string>();
    for (const { task } of loadDetonateCorpus()) {
      const groups = [
        ...task.production_endpoint_alert_groups,
        ...task.diagnostic_endpoint_alert_groups,
        ...task.production_detection_alert_groups,
      ] as Array<{
        alert_docs?: Array<{
          host?: { name?: string; hostname?: string };
          Endpoint?: { policy?: { applied?: { name?: string } } };
        }>;
      }>;
      for (const doc of groups.flatMap((g) => g.alert_docs ?? [])) {
        for (const host of [doc.host?.name, doc.host?.hostname]) if (host) hosts.add(host);
        const policy = doc.Endpoint?.policy?.applied?.name;
        if (policy) policies.add(policy);
      }
    }
    expect([...hosts]).toEqual(['detonate-sandbox-linux-01']);
    expect([...policies]).toEqual(['Detonate sandbox policy']);
  });
});
