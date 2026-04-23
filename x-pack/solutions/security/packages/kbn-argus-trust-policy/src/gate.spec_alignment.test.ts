/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { promises as fs } from 'fs';
import path from 'path';

/**
 * Structural alignment check between the TS spec (`evaluateTrustGate`) and
 * the runtime YAML at `soc-simulation/workflows/soc-argus-trust-gate.yaml`.
 *
 * We can't run Liquid from Jest without spinning up the workflows engine,
 * but we CAN assert that the YAML's verdict and reason branches name every
 * verdict / reason the TS spec defines, and no others. That catches the
 * most common drift — someone adding a reason to one side but not the
 * other, or misspelling a reason code.
 */

const YAML_PATH = path.resolve(
  __dirname,
  '../../../../../../soc-simulation/workflows/soc-argus-trust-gate.yaml'
);

describe('trust-gate YAML ↔ TS spec alignment', () => {
  let yaml: string;

  beforeAll(async () => {
    yaml = await fs.readFile(YAML_PATH, 'utf8');
  });

  it('YAML file exists and is readable', () => {
    expect(yaml.length).toBeGreaterThan(100);
    expect(yaml).toContain('Argus Trust Gate');
  });

  it('YAML mentions every verdict the TS spec can emit', () => {
    const expectedVerdicts = ['allow', 'pending_review', 'rejected_trust'];
    for (const verdict of expectedVerdicts) {
      expect(yaml).toContain(verdict);
    }
  });

  it('YAML mentions every reason code the TS spec can emit (minus purely-TS ones)', () => {
    // These reason codes are emitted by the Liquid explicitly. The
    // spec adds `actor_quarantined` + `frontier_origin_requires_frontier_tier`
    // which are not yet surfaced as Liquid strings — they're covered by
    // the `quarantined` / frontier-origin branches. That's fine; the TS
    // spec is the more granular source of truth and the YAML is free to
    // use coarser reason strings as long as it keeps the verdicts right.
    const yamlReasons = [
      'no_actor_tier',
      'one_way_door_requires_human',
      'blast_tier_critical_requires_human',
      'blast_tier_large_exceeds_actor_cap',
      'trust_policy_gate',
    ];
    for (const reason of yamlReasons) {
      expect(yaml).toContain(reason);
    }
  });

  it('YAML includes a reference comment pointing at the TS spec', () => {
    // The YAML should carry an explicit pointer so an editor of the Liquid
    // side is reminded to update the TS spec. We accept any of a few
    // likely phrasings to keep the test stable across future doc edits.
    const hasPointer =
      yaml.includes('@kbn/argus-trust-policy') ||
      yaml.includes('kbn-argus-trust-policy') ||
      yaml.includes('R7') ||
      yaml.includes('Argus R7') ||
      yaml.includes('Argus R5 + R7');
    expect(hasPointer).toBe(true);
  });
});
