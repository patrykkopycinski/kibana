/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { promises as fs } from 'fs';
import path from 'path';

/**
 * Alignment check between the TS spec (`classifyBacktest`) and the two
 * runtime YAMLs that consume its verdicts:
 *   - `soc-simulation/workflows/soc-rule-backtester.yaml` (verdict producer)
 *   - `soc-simulation/workflows/soc-autonomous-applier.yaml` (verdict consumer)
 *
 * The YAML files encode the same matrix in Liquid. This test checks the
 * Liquid mentions every verdict / status the TS spec can emit. This is
 * drift-catching only — it cannot prove behavioral equivalence, but it
 * does catch the common "renamed a verdict on one side" class of bug.
 */

const REPO_ROOT = path.resolve(__dirname, '../../../../../..');
const BACKTESTER_YAML = path.join(REPO_ROOT, 'soc-simulation/workflows/soc-rule-backtester.yaml');
const APPLIER_YAML = path.join(REPO_ROOT, 'soc-simulation/workflows/soc-autonomous-applier.yaml');

describe('backtest spec ↔ YAML alignment', () => {
  let backtester: string;
  let applier: string;

  beforeAll(async () => {
    backtester = await fs.readFile(BACKTESTER_YAML, 'utf8');
    applier = await fs.readFile(APPLIER_YAML, 'utf8');
  });

  it('backtester YAML exists and contains the producer logic', () => {
    expect(backtester.length).toBeGreaterThan(500);
    expect(backtester).toMatch(/SOC Rule Backtester|backtest/i);
  });

  it('applier YAML exists and contains the consumer logic', () => {
    expect(applier.length).toBeGreaterThan(500);
    expect(applier).toMatch(/applier|auto_apply_ready/i);
  });

  it('backtester YAML references every BacktestVerdict the TS spec can emit', () => {
    const verdicts = ['projection_safe', 'projection_concerning', 'projection_unknown'];
    for (const verdict of verdicts) {
      expect(backtester).toContain(verdict);
    }
  });

  it('backtester YAML references every MutationIntentStatus the spec produces', () => {
    const statuses = ['auto_apply_ready', 'pending_review'];
    for (const status of statuses) {
      expect(backtester).toContain(status);
    }
  });

  it('applier YAML enforces backtest_required gate', () => {
    // R8 invariant — the applier must refuse rule mutations without a
    // backtest_verdict. Both the comment and the gate-name must be
    // present so this invariant is visible in the runtime config.
    expect(applier).toMatch(/backtest_required|awaiting_backtest/);
    expect(applier).toMatch(/backtest_verdict/);
  });

  it('applier logs backtest_verdict and backtest_ref on every decision', () => {
    // R8 audit-trail invariant — every `.soc-autonomy-decisions` row
    // for a rule mutation carries the backtest reference so we can
    // prove every auto_apply went through the shadow execution.
    expect(applier).toMatch(/backtest_verdict:/);
    expect(applier).toMatch(/backtest_ref:/);
  });
});
