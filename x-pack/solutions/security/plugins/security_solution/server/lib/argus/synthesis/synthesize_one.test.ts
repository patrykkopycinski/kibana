/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import {
  ARGUS_DEMO_ADVISORIES,
  type StructuredAdvisory,
  type VariantCandidate,
  type VariantProvider,
  type VariantProviderInput,
} from '@kbn/argus-exploit-to-detection';

import { SYNTHESIS_REJECTION_RATE_DEAD_LETTER_THRESHOLD } from './constants';
import { synthesizeOne } from './synthesize_one';

const NOW = Date.parse('2026-05-05T12:00:00.000Z');

const advisory0 = ARGUS_DEMO_ADVISORIES[0];
const advisory1 = ARGUS_DEMO_ADVISORIES[1];

/**
 * Provider that emits intentionally invalid candidates (platform-binary
 * allow-list violation). Forces the validator to reject everything so we
 * can prove the dead-letter path triggers.
 */
const buildRejectingProvider = (): VariantProvider => ({
  async generate(input: VariantProviderInput): Promise<readonly VariantCandidate[]> {
    return Array.from({ length: input.budget }, (_, i) => ({
      // `windows` advisories don't allow `bash`, so every candidate fails
      // the platform-binary allow-list.
      process_name: 'bash',
      process_executable: '/usr/bin/bash',
      command_line: `bash -c "echo malicious-${i}"`,
      parent_name: 'systemd',
      parent_executable: '/usr/lib/systemd/systemd',
      rationale: `intentionally-invalid for test ${i}`,
    }));
  },
});

const newLogger = () => loggingSystemMock.createLogger();

describe('synthesizeOne — happy path', () => {
  it('returns a synthesized outcome with a populated mutation_intent for a clean advisory', async () => {
    const outcome = await synthesizeOne({
      advisory: advisory0,
      logger: newLogger(),
      now: NOW,
    });

    expect(outcome.kind).toBe('synthesized');
    expect(outcome.mutation_intent).toBeDefined();
    expect(outcome.mutation_intent?.type).toBe('mutation_intent');
    expect(outcome.mutation_intent?.kind).toBe('rule_create');
    expect(outcome.mutation_intent?.advisory_id).toBe(advisory0.advisory_id);
    expect(outcome.mutation_intent?.confidence).toBeGreaterThanOrEqual(0);
    expect(outcome.mutation_intent?.confidence).toBeLessThanOrEqual(100);
    expect(outcome.mutation_intent?.variant_count).toBeGreaterThan(0);
  });

  it('embeds the caller_id into the corpus_id stamped on the mutation_intent', async () => {
    const outcome = await synthesizeOne({
      advisory: advisory0,
      logger: newLogger(),
      now: NOW,
      callerId: 'workflow-soc-argus-synthesis-driver',
    });

    expect(outcome.mutation_intent?.variant_corpus_id).toContain(
      'workflow-soc-argus-synthesis-driver'
    );
    expect(outcome.mutation_intent?.variant_corpus_id).toContain(advisory0.advisory_id);
  });

  it('emits per-variant trace events on the outcome', async () => {
    const outcome = await synthesizeOne({
      advisory: advisory0,
      logger: newLogger(),
      now: NOW,
    });

    expect(outcome.traces.length).toBeGreaterThan(0);
    expect(outcome.traces[0].advisory_id).toBe(advisory0.advisory_id);
    expect(outcome.traces[0].provider).toBe('scripted-llm');
  });

  it('emits distinct rec_ids for back-to-back synthesis of two different advisories', async () => {
    const a = await synthesizeOne({ advisory: advisory0, logger: newLogger(), now: NOW });
    const b = await synthesizeOne({ advisory: advisory1, logger: newLogger(), now: NOW });

    expect(a.mutation_intent?.rec_id).toBeDefined();
    expect(b.mutation_intent?.rec_id).toBeDefined();
    expect(a.mutation_intent?.rec_id).not.toBe(b.mutation_intent?.rec_id);
  });
});

describe('synthesizeOne — dead-letter path', () => {
  it('dead-letters when the rejection rate exceeds the threshold', async () => {
    const outcome = await synthesizeOne({
      advisory: advisory0,
      logger: newLogger(),
      now: NOW,
      provider: buildRejectingProvider(),
    });

    expect(outcome.kind).toBe('dead_letter_high_rejection_rate');
    expect(outcome.reason).toContain('rejection_rate');
    expect(outcome.mutation_intent).toBeUndefined();
  });

  it('still returns the partial trace events so the caller can audit failures', async () => {
    const outcome = await synthesizeOne({
      advisory: advisory0,
      logger: newLogger(),
      now: NOW,
      provider: buildRejectingProvider(),
    });

    expect(outcome.traces.length).toBeGreaterThan(0);
  });

  it('rejection threshold constant is in (0, 1) — sanity check', () => {
    expect(SYNTHESIS_REJECTION_RATE_DEAD_LETTER_THRESHOLD).toBeGreaterThan(0);
    expect(SYNTHESIS_REJECTION_RATE_DEAD_LETTER_THRESHOLD).toBeLessThan(1);
  });
});

describe('synthesizeOne — error propagation', () => {
  it('throws when the advisory fails the package-level validateAdvisory check', async () => {
    const malformed = { ...advisory0, signals: [] } as unknown as StructuredAdvisory;

    await expect(
      synthesizeOne({
        advisory: malformed,
        logger: newLogger(),
        now: NOW,
      })
    ).rejects.toThrow();
  });
});
