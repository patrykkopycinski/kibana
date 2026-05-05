/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import { ARGUS_DEMO_ADVISORIES } from '@kbn/argus-exploit-to-detection';

import {
  CrownJewelDocSchema,
  EvolutionLogRowSchema,
  KillSwitchDocSchema,
  MutationIntentEnvelopeSchema,
  ReasoningTraceEventSchema,
  SOC_ADVISORY_SCHEMA_VERSION,
  SOC_CROWN_JEWELS_SCHEMA_VERSION,
  SOC_EVOLUTION_LOG_SCHEMA_VERSION,
  SOC_KILL_SWITCH_SCHEMA_VERSION,
  SOC_MUTATION_INTENT_SCHEMA_VERSION,
  SOC_REASONING_TRACE_SCHEMA_VERSION,
  StructuredAdvisorySchema,
  checkContract,
} from './contracts';
import {
  SYNTHESIS_DRIVER_AGENT_ID,
  SYNTHESIS_DRIVER_AGENT_VERSION,
  SYNTHESIS_DRIVER_INITIAL_TRUST_TIER,
} from './constants';
import { synthesizeOne } from './synthesize_one';

/**
 * B16 — contract test suite.
 *
 * Positive paths use real `synthesizeOne` output + the canonical advisory
 * fixtures, so we are testing the actual production envelopes — not
 * hand-crafted samples that could drift away from the producers.
 *
 * Negative paths cover the historical drift modes that bit us during the
 * F-007 / F-015 boots: legacy `proposed_rule_delta.*` envelopes, nested
 * `agent: { id }` evolution-log rows, and legacy `techniques /
 * platforms / observable_signals` advisory shapes.
 */

const NOW = Date.parse('2026-05-05T12:00:00.000Z');
const advisory = ARGUS_DEMO_ADVISORIES[0];
const newLogger = () => loggingSystemMock.createLogger();

describe('B16 contracts — schema versions are integers', () => {
  it('exposes a stable, integer schema_version for every documented index', () => {
    expect(Number.isInteger(SOC_ADVISORY_SCHEMA_VERSION)).toBe(true);
    expect(Number.isInteger(SOC_MUTATION_INTENT_SCHEMA_VERSION)).toBe(true);
    expect(Number.isInteger(SOC_REASONING_TRACE_SCHEMA_VERSION)).toBe(true);
    expect(Number.isInteger(SOC_EVOLUTION_LOG_SCHEMA_VERSION)).toBe(true);
    expect(Number.isInteger(SOC_KILL_SWITCH_SCHEMA_VERSION)).toBe(true);
    // Mutation-intent is the canonical envelope; current generation is 2.
    expect(SOC_MUTATION_INTENT_SCHEMA_VERSION).toBe(2);
  });
});

describe('B16 contracts — .soc-cve-advisories', () => {
  it('parses every demo advisory in ARGUS_DEMO_ADVISORIES', () => {
    for (const adv of ARGUS_DEMO_ADVISORIES) {
      const result = checkContract(StructuredAdvisorySchema, adv);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        // surface the failure for debugging
        throw new Error(`advisory ${adv.advisory_id} failed: ${result.issues?.join('; ')}`);
      }
    }
  });

  it('rejects the legacy fixture shape (techniques / platforms / observable_signals)', () => {
    const legacy = {
      ...advisory,
      techniques: ['T1003.001'],
      platforms: ['windows'],
      observable_signals: [{ field: 'process.name', value: 'lsass.exe' }],
    };
    const result = checkContract(StructuredAdvisorySchema, legacy);
    expect(result.ok).toBe(false);
    expect(result.issues?.join('; ')).toMatch(/legacy field detected/i);
  });

  it('rejects an advisory with empty signals', () => {
    const broken = { ...advisory, signals: [] };
    const result = checkContract(StructuredAdvisorySchema, broken);
    expect(result.ok).toBe(false);
  });

  it('tolerates extra fields that future producers might attach', () => {
    const decorated = { ...advisory, ingested_at: '2026-05-05T00:00:00.000Z', source: 'kev' };
    expect(checkContract(StructuredAdvisorySchema, decorated).ok).toBe(true);
  });
});

describe('B16 contracts — .soc-mutation-intents', () => {
  it('a real synthesizeOne mutation_intent parses cleanly', async () => {
    const outcome = await synthesizeOne({ advisory, logger: newLogger(), now: NOW });
    expect(outcome.mutation_intent).toBeDefined();
    const result = checkContract(MutationIntentEnvelopeSchema, outcome.mutation_intent);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(`real mutation_intent failed: ${result.issues?.join('; ')}`);
    }
  });

  it('a chat-skill mutation_intent (callerId="chat-skill") parses cleanly', async () => {
    const outcome = await synthesizeOne({
      advisory,
      logger: newLogger(),
      now: NOW,
      callerId: 'chat-skill',
    });
    expect(checkContract(MutationIntentEnvelopeSchema, outcome.mutation_intent).ok).toBe(true);
  });

  it('rejects the legacy `proposed_rule_delta` envelope shape', async () => {
    const outcome = await synthesizeOne({ advisory, logger: newLogger(), now: NOW });
    const legacy = {
      ...outcome.mutation_intent!,
      proposed_rule_delta: { change_type: 'create', mitre_technique: 'T1003.001' },
    };
    const result = checkContract(MutationIntentEnvelopeSchema, legacy);
    expect(result.ok).toBe(false);
    expect(result.issues?.join('; ')).toMatch(/proposed_rule_delta/);
  });

  it('rejects an envelope whose schema_version is not the current integer', async () => {
    const outcome = await synthesizeOne({ advisory, logger: newLogger(), now: NOW });
    const drifted = { ...outcome.mutation_intent!, schema_version: 1 };
    expect(checkContract(MutationIntentEnvelopeSchema, drifted).ok).toBe(false);
  });

  it('rejects an envelope with `confidence` outside [0, 100]', async () => {
    const outcome = await synthesizeOne({ advisory, logger: newLogger(), now: NOW });
    const drifted = { ...outcome.mutation_intent!, confidence: 250 };
    expect(checkContract(MutationIntentEnvelopeSchema, drifted).ok).toBe(false);
  });

  it('rejects an envelope missing the canonical `kind: "rule_create"` discriminator', async () => {
    const outcome = await synthesizeOne({ advisory, logger: newLogger(), now: NOW });
    const drifted = { ...outcome.mutation_intent! } as Record<string, unknown>;
    delete drifted.kind;
    expect(checkContract(MutationIntentEnvelopeSchema, drifted).ok).toBe(false);
  });

  it('tolerates downstream-attached fields (e.g. governance_gate.status from trust-policy)', async () => {
    const outcome = await synthesizeOne({ advisory, logger: newLogger(), now: NOW });
    const decorated = {
      ...outcome.mutation_intent!,
      governance_gate: { status: 'pass', verdict: 'projection_safe' },
      applier_marks: { applied_at: '2026-05-05T12:00:00.000Z' },
    };
    expect(checkContract(MutationIntentEnvelopeSchema, decorated).ok).toBe(true);
  });
});

describe('B16 contracts — .soc-reasoning-trace', () => {
  it('every trace event from a real synthesizeOne run parses cleanly', async () => {
    const outcome = await synthesizeOne({ advisory, logger: newLogger(), now: NOW });
    expect(outcome.traces.length).toBeGreaterThan(0);
    for (const event of outcome.traces) {
      const stamped = { '@timestamp': new Date(NOW).toISOString(), ...event };
      const result = checkContract(ReasoningTraceEventSchema, stamped);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(`trace event failed: ${result.issues?.join('; ')}`);
      }
    }
  });

  it('rejects a trace event with an unknown axis', () => {
    const broken = {
      corpus_id: 'corpus.test.1',
      rule_id: 'argus.test.1',
      advisory_id: advisory.advisory_id,
      axis: 'unknown_axis',
      platform: 'linux',
      variant_index: 0,
      accepted: true,
      reasons: [],
      rationale: 'test',
      command_line_sample: 'echo hi',
      provider: 'scripted',
    };
    expect(checkContract(ReasoningTraceEventSchema, broken).ok).toBe(false);
  });

  it('rejects a trace event with an unknown platform', () => {
    const broken = {
      corpus_id: 'corpus.test.1',
      rule_id: 'argus.test.1',
      advisory_id: advisory.advisory_id,
      axis: 'command_args',
      platform: 'aix',
      variant_index: 0,
      accepted: true,
      reasons: [],
      rationale: 'test',
      command_line_sample: 'echo hi',
      provider: 'scripted',
    };
    expect(checkContract(ReasoningTraceEventSchema, broken).ok).toBe(false);
  });
});

describe('B16 contracts — .soc-evolution-log', () => {
  const canonicalAdvisoryRow = () => ({
    '@timestamp': new Date(NOW).toISOString(),
    event_type: 'synthesis.advisory',
    agent_id: SYNTHESIS_DRIVER_AGENT_ID,
    source: SYNTHESIS_DRIVER_AGENT_ID,
    actor: `${SYNTHESIS_DRIVER_AGENT_ID}.workflow`,
    trust_tier: SYNTHESIS_DRIVER_INITIAL_TRUST_TIER,
    result: 'ok',
    message: 'Synthesis attempt for CVE-2024-1234 via workflow: synthesized rec=argus-e2d-x',
    metrics_snapshot: {
      caller_id: 'workflow',
      advisory_id: 'CVE-2024-1234',
      rec_id: 'argus-e2d-x',
      outcome_kind: 'synthesized',
      trace_count: 12,
      duration_ms: 845,
      agent_version: SYNTHESIS_DRIVER_AGENT_VERSION,
    },
  });

  it('parses the canonical flat row produced by the workflow step + chat tool', () => {
    expect(checkContract(EvolutionLogRowSchema, canonicalAdvisoryRow()).ok).toBe(true);
  });

  it('parses a tick-summary row produced by the soc-argus-synthesis-driver workflow', () => {
    const tickRow = {
      '@timestamp': new Date(NOW).toISOString(),
      event_type: 'synthesis.tick',
      agent_id: SYNTHESIS_DRIVER_AGENT_ID,
      source: 'soc-argus-synthesis-driver',
      actor: SYNTHESIS_DRIVER_AGENT_ID,
      trust_tier: SYNTHESIS_DRIVER_INITIAL_TRUST_TIER,
      result: 'ok',
      message: 'ARGUS synthesis tick — autonomy_enabled=yes advisories_in=3',
      metrics_snapshot: { autonomy_enabled: true, advisories_in: 3, tick_id: 'tick-1' },
    };
    expect(checkContract(EvolutionLogRowSchema, tickRow).ok).toBe(true);
  });

  it('rejects the legacy nested `agent: { id }` shape (F-015 part a)', () => {
    const legacy = {
      ...canonicalAdvisoryRow(),
      agent: { id: SYNTHESIS_DRIVER_AGENT_ID, version: SYNTHESIS_DRIVER_AGENT_VERSION },
    };
    const result = checkContract(EvolutionLogRowSchema, legacy);
    expect(result.ok).toBe(false);
    expect(result.issues?.join('; ')).toMatch(/legacy nested shape/i);
  });

  it('rejects rows that use legacy `event` instead of `event_type`', () => {
    const legacy: Record<string, unknown> = {
      ...canonicalAdvisoryRow(),
      event: 'synthesis.tick',
    };
    delete legacy.event_type;
    expect(checkContract(EvolutionLogRowSchema, legacy).ok).toBe(false);
  });

  it('rejects rows whose trust_tier is unknown', () => {
    const drifted = { ...canonicalAdvisoryRow(), trust_tier: 'super_user' };
    expect(checkContract(EvolutionLogRowSchema, drifted).ok).toBe(false);
  });

  it('tolerates extra metrics_snapshot keys (forward compat)', () => {
    const decorated = {
      ...canonicalAdvisoryRow(),
      metrics_snapshot: {
        ...canonicalAdvisoryRow().metrics_snapshot,
        future_field: 'new-thing',
      },
    };
    expect(checkContract(EvolutionLogRowSchema, decorated).ok).toBe(true);
  });
});

describe('B16 contracts — .soc-kill-switch', () => {
  it('parses an enabled kill-switch document', () => {
    const doc = {
      '@timestamp': new Date(NOW).toISOString(),
      autonomy_enabled: true,
    };
    expect(checkContract(KillSwitchDocSchema, doc).ok).toBe(true);
  });

  it('parses a disabled kill-switch document with a reason + operator', () => {
    const doc = {
      '@timestamp': new Date(NOW).toISOString(),
      autonomy_enabled: false,
      reason: 'incident-2026-05-05',
      operator: 'soc.lead@example.com',
    };
    expect(checkContract(KillSwitchDocSchema, doc).ok).toBe(true);
  });

  it('rejects a doc whose autonomy_enabled is a string instead of a boolean', () => {
    const broken = {
      '@timestamp': new Date(NOW).toISOString(),
      autonomy_enabled: 'no',
    };
    expect(checkContract(KillSwitchDocSchema, broken).ok).toBe(false);
  });
});

describe('B5 contracts — .soc-crown-jewels', () => {
  const baseDoc = () => ({
    '@timestamp': new Date(NOW).toISOString(),
    asset_id: 'cj-prod-pki-root',
    schema_version: SOC_CROWN_JEWELS_SCHEMA_VERSION,
    asset_type: 'host' as const,
    name: 'PKI Root CA',
    tier: 'crown' as const,
    owner: 'identity-platform',
    business_function: 'Issues all internal cert chains.',
    match_patterns: [{ kind: 'host_name' as const, values: ['pki-root-1', 'pki-root-2'] }],
    tags: ['environment:prod', 'tier:1'],
    compliance_scope: ['sox' as const, 'iso27001' as const],
    recovery_priority: 1,
    gate_active: true,
  });

  it('parses a fully populated crown-jewel asset doc', () => {
    expect(checkContract(CrownJewelDocSchema, baseDoc()).ok).toBe(true);
  });

  it('parses a minimal crown-jewel asset doc (only required fields)', () => {
    const minimal = {
      '@timestamp': new Date(NOW).toISOString(),
      asset_id: 'cj-min',
      asset_type: 'host' as const,
      name: 'minimal',
      tier: 'silver' as const,
      owner: 'platform-team',
      match_patterns: [{ kind: 'host_name' as const, values: ['host-a'] }],
    };
    expect(checkContract(CrownJewelDocSchema, minimal).ok).toBe(true);
  });

  it('rejects a doc with an unknown tier', () => {
    const drifted = { ...baseDoc(), tier: 'mythic' };
    expect(checkContract(CrownJewelDocSchema, drifted).ok).toBe(false);
  });

  it('rejects a doc with an unknown asset_type', () => {
    const drifted = { ...baseDoc(), asset_type: 'building' };
    expect(checkContract(CrownJewelDocSchema, drifted).ok).toBe(false);
  });

  it('rejects a doc with an unknown match_pattern.kind', () => {
    const drifted = {
      ...baseDoc(),
      match_patterns: [{ kind: 'mac_address', values: ['aa:bb:cc:dd:ee:ff'] }],
    };
    expect(checkContract(CrownJewelDocSchema, drifted).ok).toBe(false);
  });

  it('rejects a doc with empty match_patterns', () => {
    const drifted = { ...baseDoc(), match_patterns: [] };
    expect(checkContract(CrownJewelDocSchema, drifted).ok).toBe(false);
  });

  it('rejects a doc whose match_pattern has empty values', () => {
    const drifted = {
      ...baseDoc(),
      match_patterns: [{ kind: 'host_name' as const, values: [] }],
    };
    expect(checkContract(CrownJewelDocSchema, drifted).ok).toBe(false);
  });

  it('rejects a doc whose recovery_priority is out of [1, 10]', () => {
    const drifted = { ...baseDoc(), recovery_priority: 11 };
    expect(checkContract(CrownJewelDocSchema, drifted).ok).toBe(false);
  });

  it('tolerates extra fields (forward compatibility)', () => {
    const decorated = {
      ...baseDoc(),
      runbook_url: 'https://runbooks.example.com/pki',
      future_field: 'something',
    };
    expect(checkContract(CrownJewelDocSchema, decorated).ok).toBe(true);
  });
});
