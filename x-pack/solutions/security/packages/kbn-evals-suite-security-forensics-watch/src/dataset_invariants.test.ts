/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { FORENSIC_CASES } from './dataset';
import { buildForensicEvents } from './data_generators/forensic_data';
import { buildSeededIocIndex, findDatasetTelemetryViolations } from './dataset_invariants';
import type { ForensicExample } from './types';

const SEED_BASE_TIME = new Date('2026-08-18T10:00:00Z');
const seededIocs = buildSeededIocIndex(buildForensicEvents(SEED_BASE_TIME));

const caseById = (id: string): ForensicExample => {
  const found = FORENSIC_CASES.find((example) => example.id === id);
  if (!found) throw new Error(`no dataset case ${id}`);
  return found;
};

describe('dataset golden IoC labels vs seeded telemetry', () => {
  it('seeds the IoC-bearing telemetry the labels are scored against', () => {
    // A seeder that stops inserting these values would make the checks below
    // vacuous rather than failing, so the fixture is asserted directly.
    expect(seededIocs.networkDestinations).toContain('203.0.113.77');
    expect(seededIocs.networkDestinations).toContain('192.168.1.100');
    expect(seededIocs.registryPaths.length).toBeGreaterThan(0);
  });

  it('has no golden label contradicted by the telemetry the seeder inserts', () => {
    expect(findDatasetTelemetryViolations(FORENSIC_CASES, seededIocs)).toEqual([]);
  });

  it('reports a confirmed label the seeder has no evidence for', () => {
    const example = caseById('dwf-supply-chain-initial-access');
    const mutated: ForensicExample = {
      ...example,
      output: {
        ...example.output,
        expectedIocs: [{ type: 'network_destination', value: '198.51.100.9', status: 'confirmed' }],
      },
    };

    expect(findDatasetTelemetryViolations([mutated], seededIocs)).toEqual([
      'dwf-supply-chain-initial-access: expects network_destination=198.51.100.9 confirmed but the seeder inserts no matching telemetry',
    ]);
  });

  it('reports a not_found label the seeder does insert (the supply-chain C2 regression)', () => {
    // Regression: 203.0.113.77 was labelled not_found while the seeder inserted
    // a DEV-WKS-07 network event to exactly that destination, so a correct IoC
    // validator was scored as wrong.
    const example = caseById('dwf-supply-chain-initial-access');
    const mutated: ForensicExample = {
      ...example,
      output: {
        ...example.output,
        expectedIocs: [{ type: 'network_destination', value: '203.0.113.77', status: 'not_found' }],
      },
    };

    expect(findDatasetTelemetryViolations([mutated], seededIocs)).toEqual([
      'dwf-supply-chain-initial-access: expects network_destination=203.0.113.77 not_found but the seeder inserts matching telemetry',
    ]);
  });
});
