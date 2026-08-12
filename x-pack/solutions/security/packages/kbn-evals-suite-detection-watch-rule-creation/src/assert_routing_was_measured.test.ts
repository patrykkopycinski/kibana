/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { RuleCreationClient } from './rule_creation_client';

/**
 * `assertRoutingWasMeasured` is the guard against a false green. The suite asserts no scores in
 * the spec, so without it a run where every trace lookup failed still reports "2 passed".
 *
 * The counters are private and only mutated by a full `run()` (which needs a live stack), so these
 * tests drive them directly rather than standing up a fake workflow API — the branch logic is what
 * matters here.
 */
const clientWith = (executionCount: number, unavailableCount: number): RuleCreationClient => {
  const client = Object.create(RuleCreationClient.prototype) as RuleCreationClient;
  Object.assign(client, { executionCount, unavailableCount });
  return client;
};

describe('assertRoutingWasMeasured', () => {
  it('throws when nothing ran at all', () => {
    expect(() => clientWith(0, 0).assertRoutingWasMeasured()).toThrow(/measured nothing/);
  });

  it('throws when every execution lost its traces', () => {
    // The exact false-green reproduced on 2026-08-11: EVALS_RC=0 and "2 passed" while Tool Routing
    // and Trajectory Efficiency showed "-" for all examples.
    expect(() => clientWith(4, 4).assertRoutingWasMeasured()).toThrow(/harness failure/);
  });

  it('throws when some executions lost their traces', () => {
    // Partial loss is not tolerated. Null scores are dropped from `extended_stats` rather than
    // counted as 0, so a run where 3 of 4 executions lost traces reports routing from the single
    // survivor as if it covered the dataset. `fetchToolCalls` already retries 5 times with backoff
    // before marking a run unavailable, so reaching this point means the pipeline is broken, not
    // momentarily slow.
    expect(() => clientWith(4, 3).assertRoutingWasMeasured()).toThrow(/3 of 4/);
    expect(() => clientWith(4, 1).assertRoutingWasMeasured()).toThrow(/harness failure/);
  });

  it('passes when every execution was traced', () => {
    expect(() => clientWith(4, 0).assertRoutingWasMeasured()).not.toThrow();
  });
});
