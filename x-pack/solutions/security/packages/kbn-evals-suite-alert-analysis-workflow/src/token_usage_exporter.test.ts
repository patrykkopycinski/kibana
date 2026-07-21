/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { exportTokenUsageRow } from './token_usage_exporter';

const tmp = mkdtempSync(path.join(tmpdir(), 'token-usage-export-'));
const outFile = path.join(tmp, 'usage.jsonl');

describe('exportTokenUsageRow', () => {
  beforeEach(() => {
    process.env.ALERT_ANALYSIS_TOKEN_USAGE_PATH = outFile;
    process.env.TEST_RUN_ID = 'test-run';
  });

  afterAll(() => {
    delete process.env.ALERT_ANALYSIS_TOKEN_USAGE_PATH;
    rmSync(tmp, { recursive: true, force: true });
  });

  it('appends one JSONL row per call with verdict tokens + latency', () => {
    exportTokenUsageRow({
      connectorId: 'eis-haiku',
      alertId: 'alert-1',
      stratum: 'base',
      verdict: {
        classification: 'true_positive',
        confidenceScore: 0.9,
        executionStatus: 'succeeded',
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          cachedTokens: 10,
        },
        latencyMs: 2000,
      } as any,
    });

    const lines = readFileSync(outFile, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const row = JSON.parse(lines[0]);
    expect(row.connectorId).toBe('eis-haiku');
    expect(row.alertId).toBe('alert-1');
    expect(row.stratum).toBe('base');
    expect(row.inputTokens).toBe(100);
    expect(row.outputTokens).toBe(50);
    expect(row.totalTokens).toBe(150);
    expect(row.cachedTokens).toBe(10);
    expect(row.latencyMs).toBe(2000);
    expect(row.executionStatus).toBe('succeeded');
  });

  it('handles missing usage (failed workflow) with nulls', () => {
    exportTokenUsageRow({
      connectorId: 'eis-haiku',
      alertId: 'alert-2',
      stratum: 'hard-case',
      verdict: {
        classification: undefined,
        executionStatus: 'failed',
      } as any,
    });

    const lines = readFileSync(outFile, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    const row = JSON.parse(lines[1]);
    expect(row.inputTokens).toBeNull();
    expect(row.outputTokens).toBeNull();
    expect(row.latencyMs).toBeNull();
    expect(row.executionStatus).toBe('failed');
    expect(row.predicted).toBeNull();
  });

  it('creates parent dir if missing', () => {
    const nested = path.join(tmp, 'nested', 'deep', 'usage.jsonl');
    process.env.ALERT_ANALYSIS_TOKEN_USAGE_PATH = nested;
    exportTokenUsageRow({
      connectorId: 'c',
      alertId: 'a',
      stratum: 'base',
      verdict: { classification: 'false_positive', executionStatus: 'succeeded' } as any,
    });
    const rows = readFileSync(nested, 'utf-8').trim().split('\n');
    expect(rows).toHaveLength(1);
  });
});
