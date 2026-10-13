/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loadCorpus, loadCorpusExamples } from './corpus_loader';
import { buildEvidence } from './evidence';

const MANAGEMENT_PARENTS = ['CcmExec.exe', 'mdmdaemon.exe'];
const VENDOR_DESTINATIONS = ['graph.microsoft.com', 'download.windowsupdate.com'];
const MALICIOUS_MARKERS = [
  'c2',
  'beacon',
  'rat',
  'amsi',
  'inject',
  'payload',
  'obfuscated',
  'shellcode',
  'rundll32',
  'msiexec',
  'powershell -enc',
  'base64',
];
const MARKER_RE = new RegExp(`\\b(${MALICIOUS_MARKERS.join('|')})\\b`, 'i');

describe('fp-positive-control corpus', () => {
  const cases = loadCorpus('fp-positive-control');

  it('loads both positive-control cases and passes the corpus loader', () => {
    expect(cases).toHaveLength(2);
    for (const c of cases) {
      expect(c.label).toBe('false_positive');
      expect(c.label_provenance).toBe('positive-control');
    }
    const examples = loadCorpusExamples('fp-positive-control');
    expect(examples.map((e) => e.metadata.labelProvenance)).toEqual([
      'positive-control',
      'positive-control',
    ]);
    expect(examples.every((e) => e.metadata.sanityOnly)).toBe(false);
  });

  it('seeds non-zero entity and event evidence via buildEvidence', () => {
    for (const c of cases) {
      const evidence = buildEvidence(c.payload, `ad-${c.case_id}`);
      expect(evidence.events).toHaveLength(c.payload.events!.length);
      expect(evidence.entities.length).toBeGreaterThan(0);
      expect(evidence.entities.filter((e) => e.entity.type === 'host')).toHaveLength(1);
      expect(evidence.entities.filter((e) => e.entity.type === 'user')).toHaveLength(1);
    }
  });

  it('keeps every process parent a management agent (the benign axis)', () => {
    for (const c of cases) {
      for (const event of c.payload.events! as Array<Record<string, any>>) {
        const parent = event.process?.parent?.name;
        expect(MANAGEMENT_PARENTS).toContain(parent);
      }
    }
  });

  it('keeps every network destination vendor/management only', () => {
    for (const c of cases) {
      for (const event of c.payload.events! as Array<Record<string, any>>) {
        const domain = event.destination?.domain;
        if (domain !== undefined) {
          expect(VENDOR_DESTINATIONS).toContain(domain);
        }
      }
    }
  });

  it('carries no malicious strings in any message or command line', () => {
    for (const c of cases) {
      for (const event of c.payload.events! as Array<Record<string, any>>) {
        const text = `${event.message ?? ''} ${event.process?.command_line ?? ''}`;
        expect(text).not.toMatch(MARKER_RE);
      }
    }
  });
});
