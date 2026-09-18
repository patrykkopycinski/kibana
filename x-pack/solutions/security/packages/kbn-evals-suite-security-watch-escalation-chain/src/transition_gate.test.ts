/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// L0 transition-gate for the Watch escalation chain.
//
// The chain has NO converse router surface — it is driven by `workflow.execute`
// — so a classic L0 routing-smoke (does the agent pick the right tool?) is N/A
// by design. But the chain's ENTRYPOINT still has a deterministic control-flow
// decision that a real L0 must pin: the Floor orchestrator's `escalate_to_dark`
// step fires the Floor -> Dark hop iff
//
//     classification == 'true_positive' AND confidence >= escalateThreshold
//
// This is exactly the layer-below decision that, if wrong, makes every L1/L3/L4
// score meaningless (the chain never starts, or starts on the wrong verdict).
//
// The predicate is imported from `src/transition_gate.ts` — not mirrored here —
// so a change to the policy is exercised by this test rather than by a copy of
// it. The orchestrator definition itself (`watch_floor_orchestrator.yaml`) is
// NOT in this repository, so the predicate cannot be read from it; what IS in
// tree is the Floor worker's structured-output contract
// (`kbn-workflows/managed/definitions/alertzero/floor_alert_triage.yaml`),
// which the policy has to agree with, and that is asserted below.
//
// Deterministic, no LLM, no Kibana boot — the same T0 discipline as the gate
// tests in the pnd plugin.

import fs from 'fs';
import path from 'path';
import {
  buildSyntheticEscalation,
  FLOOR_ESCALATION_POLICY,
  FLOOR_WORKER_DEFINITION_PATH,
} from './constants';
import { parseWorkerOutputContract, shouldEscalateToDark } from './transition_gate';

describe('Watch escalation chain — L0 transition gate (Floor -> Dark)', () => {
  it('escalates a high-confidence true_positive (chain is reachable)', () => {
    expect(shouldEscalateToDark({ classification: 'true_positive', confidence: 0.93 })).toBe(true);
  });

  it('does NOT escalate below the confidence threshold (no spurious Dark runs)', () => {
    const justUnder = FLOOR_ESCALATION_POLICY.escalateThreshold - 0.01;
    expect(shouldEscalateToDark({ classification: 'true_positive', confidence: justUnder })).toBe(
      false
    );
  });

  it('escalates exactly at the threshold boundary (>= is inclusive)', () => {
    expect(
      shouldEscalateToDark({
        classification: 'true_positive',
        confidence: FLOOR_ESCALATION_POLICY.escalateThreshold,
      })
    ).toBe(true);
  });

  it('does NOT escalate a non-true_positive verdict even at high confidence', () => {
    expect(shouldEscalateToDark({ classification: 'false_positive', confidence: 0.99 })).toBe(
      false
    );
    expect(shouldEscalateToDark({ classification: 'inconclusive', confidence: 0.99 })).toBe(false);
  });

  it('the synthetic fixture trips the gate and targets the policy hop', () => {
    // The fixture carries confidence 0.93 + a Floor->Dark hop; the gate must
    // accept it, otherwise the L3/L4 specs would be driving a chain the real
    // orchestrator would never have started.
    const escalation = buildSyntheticEscalation('inv-eval-l0-gate');
    expect(
      shouldEscalateToDark({
        classification: FLOOR_ESCALATION_POLICY.triggeringClassification,
        confidence: escalation.confidence,
      })
    ).toBe(true);
    expect(escalation.toWatch).toBe(FLOOR_ESCALATION_POLICY.escalateTo);
  });
});

describe('Floor escalation policy vs the in-tree Floor worker contract', () => {
  const contract = parseWorkerOutputContract(fs.readFileSync(FLOOR_WORKER_DEFINITION_PATH, 'utf8'));

  it('reads the worker definition that is actually in the repository', () => {
    expect(path.basename(FLOOR_WORKER_DEFINITION_PATH)).toBe('floor_alert_triage.yaml');
    expect(contract.classificationEnum.length).toBeGreaterThan(0);
  });

  it('triggers on a classification the worker can emit', () => {
    // A policy that keyed on a verdict the worker never produces would leave
    // the chain permanently unreachable.
    expect(contract.classificationEnum).toContain(FLOOR_ESCALATION_POLICY.triggeringClassification);
  });

  it('keeps the escalate threshold inside the confidence range the worker emits', () => {
    // A threshold above the worker's maximum (or below its minimum) makes the
    // gate either unreachable or unconditional.
    expect(FLOOR_ESCALATION_POLICY.escalateThreshold).toBeGreaterThanOrEqual(
      contract.confidenceMin
    );
    expect(FLOOR_ESCALATION_POLICY.escalateThreshold).toBeLessThanOrEqual(contract.confidenceMax);
  });
});

describe('parseWorkerOutputContract', () => {
  const fixture = [
    'properties:',
    '  classification:',
    '    type: string',
    '    enum:',
    '      - true_positive',
    '      - false_positive',
    '  confidence_score:',
    '    type: number',
    '    minimum: 0',
    '    maximum: 1',
  ].join('\n');

  it('extracts the enum and the numeric range', () => {
    expect(parseWorkerOutputContract(fixture)).toEqual({
      classificationEnum: ['true_positive', 'false_positive'],
      confidenceMin: 0,
      confidenceMax: 1,
    });
  });

  it('throws instead of silently returning an empty contract', () => {
    expect(() => parseWorkerOutputContract('steps: []')).toThrow(
      /could not read the worker output contract/
    );
  });
});
