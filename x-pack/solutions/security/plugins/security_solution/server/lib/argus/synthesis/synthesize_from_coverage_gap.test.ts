/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import type { CoverageGapInput } from '@kbn/argus-exploit-to-detection';

import type { CrownJewelAssessment } from '../governance/crown_jewel_impact';
import type { SocCrownJewelDocument } from './contracts';
import {
  resolveCoverageGapSeverity,
  synthesizeFromCoverageGap,
} from './synthesize_from_coverage_gap';

const NOW = Date.parse('2026-05-05T12:00:00.000Z');

const validGap: CoverageGapInput = {
  gap_id: 'T1059.001-endpoint',
  title: 'PowerShell encoded-command not covered on prod-payments hosts',
  rationale:
    'No active rule matches process.command_line containing `powershell.exe -enc` on the payment-gateway fleet, ' +
    'while the same technique is covered for paved-road hosts.',
  primary_source: 'endpoint',
  mitre: [
    {
      technique_id: 'T1059.001',
      technique_name: 'PowerShell',
      tactic: 'Execution',
    },
  ],
  target_platforms: ['windows'],
  signals: [
    {
      ecs_field: 'process.command_line',
      matcher: 'wildcard',
      values: ['*powershell*-enc*'],
      rationale:
        'Encoded command flag is the canonical evasion of PowerShell text-rule blocklists.',
    },
  ],
  severity: 'medium',
  affected_targets: {
    host_names: ['payment-gateway-1', 'payment-gateway-2'],
    index_patterns: ['logs-endpoint.events.process-default'],
  },
};

const crownAsset = (overrides: Partial<SocCrownJewelDocument> = {}): SocCrownJewelDocument => ({
  '@timestamp': '2026-05-05T00:00:00Z',
  asset_id: 'cj-prod-payments',
  asset_type: 'group',
  name: 'Payment authorisation fleet',
  tier: 'platinum',
  owner: 'payments-platform',
  match_patterns: [
    {
      kind: 'host_name',
      values: ['payment-gateway-*'],
      match_mode: 'wildcard',
    },
  ],
  gate_active: true,
  ...overrides,
});

const newLogger = () => loggingSystemMock.createLogger();

const makeAssessment = (overrides: Partial<CrownJewelAssessment> = {}): CrownJewelAssessment => ({
  affected: [],
  affected_count: 0,
  max_tier: 'none',
  crown_match: false,
  recommended_action: 'proceed',
  reason: 'No crown-jewel assets matched.',
  ...overrides,
});

describe('resolveCoverageGapSeverity', () => {
  it('returns base severity unchanged when no asset matched', () => {
    const result = resolveCoverageGapSeverity('medium', makeAssessment());
    expect(result.effective_severity).toBe('medium');
    expect(result.bumped).toBe(false);
    expect(result.reason).toMatch(/No crown-jewel assets matched/);
  });

  it('bumps severity to medium when only silver tier matches and base is low', () => {
    const result = resolveCoverageGapSeverity('low', makeAssessment({ max_tier: 'silver' }));
    expect(result.effective_severity).toBe('medium');
    expect(result.bumped).toBe(true);
  });

  it('does not bump when silver matches but base is already high', () => {
    const result = resolveCoverageGapSeverity('high', makeAssessment({ max_tier: 'silver' }));
    expect(result.effective_severity).toBe('high');
    expect(result.bumped).toBe(false);
  });

  it('bumps to high when gold matches and base is medium', () => {
    const result = resolveCoverageGapSeverity('medium', makeAssessment({ max_tier: 'gold' }));
    expect(result.effective_severity).toBe('high');
    expect(result.bumped).toBe(true);
  });

  it('does not bump when gold matches but base is already critical', () => {
    const result = resolveCoverageGapSeverity('critical', makeAssessment({ max_tier: 'gold' }));
    expect(result.effective_severity).toBe('critical');
    expect(result.bumped).toBe(false);
  });

  it('bumps to critical when platinum matches and base is medium', () => {
    const result = resolveCoverageGapSeverity('medium', makeAssessment({ max_tier: 'platinum' }));
    expect(result.effective_severity).toBe('critical');
    expect(result.bumped).toBe(true);
  });

  it('pins to critical when crown_match=true regardless of base', () => {
    const result = resolveCoverageGapSeverity(
      'low',
      makeAssessment({ max_tier: 'crown', crown_match: true })
    );
    expect(result.effective_severity).toBe('critical');
    expect(result.bumped).toBe(true);
    expect(result.reason).toMatch(/crown_match=true/);
  });

  it('records bumped=false when crown_match=true but base was already critical', () => {
    const result = resolveCoverageGapSeverity(
      'critical',
      makeAssessment({ max_tier: 'crown', crown_match: true })
    );
    expect(result.effective_severity).toBe('critical');
    expect(result.bumped).toBe(false);
  });
});

describe('synthesizeFromCoverageGap', () => {
  it('produces a synthesised mutation_intent with origin=coverage_gap', async () => {
    const outcome = await synthesizeFromCoverageGap({
      gap: validGap,
      crownJewels: [],
      logger: newLogger(),
      now: NOW,
    });

    expect(outcome.kind).toBe('synthesized');
    expect(outcome.origin).toBe('coverage_gap');
    expect(outcome.gap_id).toBe(validGap.gap_id);
    expect(outcome.mutation_intent).toBeDefined();
    expect(outcome.mutation_intent?.argus.origin).toBe('coverage_gap');
  });

  it('still flags source as exploit_to_detection — engine is unchanged', async () => {
    const outcome = await synthesizeFromCoverageGap({
      gap: validGap,
      crownJewels: [],
      logger: newLogger(),
      now: NOW,
    });

    expect(outcome.mutation_intent?.source).toBe('argus.exploit_to_detection');
    expect(outcome.mutation_intent?.argus.agent.id).toBe('argus.exploit_to_detection');
  });

  it('attributes the corpus_id to the coverage_gap caller', async () => {
    const outcome = await synthesizeFromCoverageGap({
      gap: validGap,
      crownJewels: [],
      logger: newLogger(),
      now: NOW,
    });

    expect(outcome.mutation_intent?.variant_corpus_id).toContain('coverage_gap');
    expect(outcome.mutation_intent?.advisory_id).toBe('gap-T1059.001-endpoint');
  });

  it('runs the crown-jewel gate and exposes the assessment on the outcome', async () => {
    const outcome = await synthesizeFromCoverageGap({
      gap: validGap,
      crownJewels: [crownAsset()],
      logger: newLogger(),
      now: NOW,
    });

    expect(outcome.crown_jewel_assessment.affected_count).toBe(1);
    expect(outcome.crown_jewel_assessment.max_tier).toBe('platinum');
    expect(outcome.crown_jewel_assessment.recommended_action).toBe('pending_review');
  });

  it('bumps severity from base medium to critical when a platinum crown-jewel matches', async () => {
    const outcome = await synthesizeFromCoverageGap({
      gap: validGap,
      crownJewels: [crownAsset()],
      logger: newLogger(),
      now: NOW,
    });

    expect(outcome.severity_resolution.base_severity).toBe('medium');
    expect(outcome.severity_resolution.effective_severity).toBe('critical');
    expect(outcome.severity_resolution.bumped).toBe(true);
  });

  it('leaves severity unchanged when no asset matches', async () => {
    const outcome = await synthesizeFromCoverageGap({
      gap: validGap,
      crownJewels: [
        crownAsset({
          asset_id: 'cj-prod-pki',
          match_patterns: [{ kind: 'host_name', values: ['pki-root-1'] }],
        }),
      ],
      logger: newLogger(),
      now: NOW,
    });

    expect(outcome.severity_resolution.base_severity).toBe('medium');
    expect(outcome.severity_resolution.effective_severity).toBe('medium');
    expect(outcome.severity_resolution.bumped).toBe(false);
    expect(outcome.crown_jewel_assessment.affected_count).toBe(0);
  });

  it('honours crown_match=true by pinning severity to critical', async () => {
    const outcome = await synthesizeFromCoverageGap({
      gap: { ...validGap, severity: 'low' },
      crownJewels: [crownAsset({ tier: 'crown' })],
      logger: newLogger(),
      now: NOW,
    });

    expect(outcome.severity_resolution.effective_severity).toBe('critical');
    expect(outcome.crown_jewel_assessment.crown_match).toBe(true);
  });

  it('throws fast when the gap is structurally invalid', async () => {
    await expect(
      synthesizeFromCoverageGap({
        gap: { ...validGap, signals: [] },
        crownJewels: [],
        logger: newLogger(),
        now: NOW,
      })
    ).rejects.toThrow(/invalid gap input/);
  });

  it('logs the severity bump when one occurs', async () => {
    const logger = newLogger();
    await synthesizeFromCoverageGap({
      gap: validGap,
      crownJewels: [crownAsset()],
      logger,
      now: NOW,
    });

    const calls = logger.info.mock.calls.map((args) => String(args[0]));
    expect(calls.some((line) => line.includes('severity bumped'))).toBe(true);
  });

  it('does not log a severity bump when no asset matches', async () => {
    const logger = newLogger();
    await synthesizeFromCoverageGap({
      gap: validGap,
      crownJewels: [],
      logger,
      now: NOW,
    });

    const calls = logger.info.mock.calls.map((args) => String(args[0]));
    expect(calls.some((line) => line.includes('severity bumped'))).toBe(false);
  });

  it('preserves the base coverage gap synthesis when crownJewels is empty', async () => {
    const outcome = await synthesizeFromCoverageGap({
      gap: validGap,
      crownJewels: [],
      logger: newLogger(),
      now: NOW,
    });

    expect(outcome.crown_jewel_assessment.recommended_action).toBe('proceed');
    expect(outcome.severity_resolution.bumped).toBe(false);
    expect(outcome.mutation_intent).toBeDefined();
  });
});
