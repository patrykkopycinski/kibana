/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';

/**
 * AutoDEX `.soc-*` contracts (B16 + B5).
 *
 * This module is the runtime source of truth for documents the synthesis
 * pipeline and the asset-aware governance gate read or write:
 *
 *   .soc-cve-advisories    — advisory inputs (StructuredAdvisory)
 *   .soc-mutation-intents  — Path A output (MutationIntent)
 *   .soc-reasoning-trace   — per-variant audit (VariantTraceEvent)
 *   .soc-evolution-log     — per-tick / per-advisory audit row
 *   .soc-kill-switch       — cluster-wide autonomy flag
 *   .soc-crown-jewels      — high-business-value asset register (B5)
 *
 * Producers (workflow step `security.argusSynthesizeAdvisory`, chat tool
 * `argus.synthesize_rule_candidate`, CLI `run_exploit_to_detection.ts`,
 * crown-jewel evaluator step) MUST validate their output through the matching
 * schema before writing. Doing so at write-time catches schema drift the
 * moment it is introduced — the kind of drift that surfaced as F-007 / F-015
 * during the live benchmark run.
 *
 * Human-readable documentation: `soc-simulation/docs/autodex/schemas/`.
 *
 * Versioning convention:
 *   - Each schema exposes a `*_SCHEMA_VERSION` constant.
 *   - Bump the integer when a backward-incompatible change ships; add a
 *     new branch to the discriminated union and keep the old branch alive
 *     for one release so consumers can migrate.
 *   - Forward-compatibility: every schema below is `.passthrough()`, so
 *     producers can attach extra fields (e.g. trust-policy decorations,
 *     applier reconciliation marks) without breaking the contract.
 *     Drift is caught by the explicit denylist refinements below, not by
 *     surprise unknown-key rejections.
 */

/* ================================================================== */
/*  Shared primitives                                                  */
/* ================================================================== */

const isoTimestampSchema = z
  .string()
  .min(1)
  .describe('ISO-8601 timestamp string. Indexed as `@timestamp` by the data stream.');

const nonEmptyString = z.string().min(1);

/* ================================================================== */
/*  .soc-cve-advisories                                                */
/* ================================================================== */

export const SOC_ADVISORY_SCHEMA_VERSION = 1;

const mitreTechniqueSchema = z
  .object({
    technique_id: nonEmptyString,
    technique_name: nonEmptyString,
    tactic: nonEmptyString,
  })
  .passthrough();

const observableSignalSchema = z
  .object({
    signal_id: nonEmptyString,
    ecs_field: nonEmptyString,
    matcher: z.enum(['terms', 'wildcard']),
    values: z.array(nonEmptyString).min(1),
    rationale: nonEmptyString,
  })
  .passthrough();

const variantAxisSchema = z.enum([
  'command_args',
  'encoding_layers',
  'process_ancestry',
  'timing_jitter_ms',
  'named_pipe_vs_stdout',
  'living_off_land',
]);

const targetPlatformSchema = z.enum(['windows', 'linux', 'macos', 'kubernetes']);

export const StructuredAdvisorySchema = z
  .object({
    advisory_id: nonEmptyString,
    cve: nonEmptyString.optional(),
    advisory_url: nonEmptyString.optional(),
    title: nonEmptyString,
    summary: nonEmptyString,
    mitre: z.array(mitreTechniqueSchema).min(1),
    target_platforms: z.array(targetPlatformSchema).min(1),
    language: z.enum(['esql', 'eql']).optional(),
    signals: z.array(observableSignalSchema).min(1),
    severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    risk_score: z.number().finite().min(0).max(100).optional(),
    variant_axes: z.array(variantAxisSchema).optional(),
    advisory_excerpts: z.array(z.string()).optional(),
  })
  .passthrough()
  .refine(
    (advisory) => {
      // Reject the legacy "techniques + platforms + observable_signals"
      // shape that the original demo seed used. Path A's validateAdvisory
      // expects the canonical names; mixing them makes the seed pack drift
      // out of sync with the package's invariant validator (F-015 part c).
      const looksLegacy =
        'techniques' in advisory || 'platforms' in advisory || 'observable_signals' in advisory;
      return !looksLegacy;
    },
    {
      message:
        '[soc-cve-advisories] legacy field detected (techniques / platforms / observable_signals). ' +
        'Use `mitre[]`, `target_platforms[]`, `signals[]` instead. See `docs/autodex/schemas/soc-cve-advisories.md`.',
    }
  );

export type SocAdvisoryDocument = z.infer<typeof StructuredAdvisorySchema>;

/* ================================================================== */
/*  .soc-mutation-intents                                              */
/* ================================================================== */

/**
 * Bumped to 2 when the envelope moved from `proposed_rule_delta.*` to the
 * `kind: 'rule_create' + draft_rule` shape (canonical M2.2). The integer
 * matches the on-disk `schema_version` the envelope-validator ingest
 * pipeline enforces.
 */
export const SOC_MUTATION_INTENT_SCHEMA_VERSION = 2;

const draftRuleSchema = z
  .object({
    rule_id: nonEmptyString,
    rule_version: nonEmptyString,
    name: nonEmptyString,
    description: nonEmptyString,
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    risk_score: z.number().finite().min(0).max(100),
    language: z.enum(['esql', 'eql']),
    mitre: z.array(mitreTechniqueSchema).min(1),
    query: z.unknown(),
    justification: z
      .object({
        advisory_excerpts: z.array(z.string()),
        observable_signals: z.array(z.string()),
        precision_hypothesis: z.string(),
      })
      .passthrough(),
  })
  .passthrough();

const blastRadiusSchema = z
  .object({
    hosts: z.number().int().min(0).optional(),
    tenants: z.number().int().min(0).optional(),
    rules: z.number().int().min(0).optional(),
  })
  .passthrough();

const blastTierSchema = z.enum(['small', 'medium', 'large', 'critical']);

const synthesisCandidateRefSchema = z
  .object({
    candidate_id: nonEmptyString,
    composition: z.unknown(),
    predicted: z
      .object({
        precision: z.number(),
        recall: z.number(),
        fp_rate: z.number(),
        axis_fn_mean: z.number(),
        axis_fn: z.record(z.string(), z.number()),
      })
      .passthrough(),
  })
  .passthrough();

export const MutationIntentEnvelopeSchema = z
  .object({
    '@timestamp': isoTimestampSchema,
    type: z.literal('mutation_intent'),
    schema_version: z.literal(SOC_MUTATION_INTENT_SCHEMA_VERSION),
    rec_id: nonEmptyString,
    source: z.literal('argus.exploit_to_detection'),
    status: z.literal('pending'),
    track: z.literal('agentic'),
    title: nonEmptyString,
    summary: nonEmptyString,
    confidence: z.number().int().min(0).max(100),
    kind: z.literal('rule_create'),
    advisory_id: nonEmptyString,
    cve: nonEmptyString.optional(),
    draft_rule: draftRuleSchema,
    variant_corpus_id: nonEmptyString,
    variant_count: z.number().int().min(1),
    // Vision-doc 4.1 — synthesis lag (ms). Optional so chat-on-demand /
    // fixture-derived intents with no advisory ingest timestamp stay valid.
    synthesis_lag_ms: z.number().int().min(0).optional(),
    evidence: z
      .array(
        z
          .object({
            kind: nonEmptyString,
            detail: nonEmptyString,
          })
          .passthrough()
      )
      .min(1),
    expected_impact: z
      .object({
        expected_fp_reduction_pct: z.number().optional(),
        expected_tp_impact: z.string(),
        coverage_delta: z.string(),
        blast_radius: blastRadiusSchema.optional(),
        blast_tier: blastTierSchema.optional(),
      })
      .passthrough(),
    details: z
      .object({
        artifact_type: z.literal('rule'),
        artifact_id: nonEmptyString,
        op: z.literal('create'),
        expected_ownership: z.literal('autosoc'),
        reason: z.string(),
        new_definition: draftRuleSchema,
      })
      .passthrough(),
    argus: z
      .object({
        origin: z.enum([
          'exploit_to_detection',
          'coverage_gap',
          'gap_analysis',
          'consolidation',
          'cti_ingest',
          'pattern_seed',
          'manual',
        ]),
        decision: z
          .object({
            kind: z.literal('rule_create'),
            confidence: z.number().min(0).max(1),
            door_class: z.enum(['one_way', 'two_way']),
          })
          .passthrough(),
        agent: z
          .object({
            id: z.literal('argus.exploit_to_detection'),
            version: nonEmptyString,
          })
          .passthrough(),
        actor: z
          .object({
            trust_tier: z.enum(['probationary', 'scoped', 'trusted', 'frontier']),
          })
          .passthrough(),
        corpus: z
          .object({
            id: nonEmptyString,
            expected_rule_id: nonEmptyString,
          })
          .passthrough(),
        synthesis: z
          .object({
            chosen: synthesisCandidateRefSchema,
            frontier: z.array(synthesisCandidateRefSchema),
            dominated: z.array(synthesisCandidateRefSchema),
            weights: z
              .object({
                precision: z.number(),
                recall: z.number(),
                fp_rate: z.number(),
                axis_fn: z.number(),
              })
              .passthrough(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough(),
  })
  .passthrough()
  .refine((intent) => !('proposed_rule_delta' in intent), {
    message:
      '[soc-mutation-intents] legacy `proposed_rule_delta` field detected. ' +
      'Use `kind: "rule_create"` + `draft_rule` (canonical M2.2 envelope). ' +
      'See `docs/autodex/schemas/soc-mutation-intents.md`.',
  });

export type SocMutationIntentDocument = z.infer<typeof MutationIntentEnvelopeSchema>;

/* ================================================================== */
/*  .soc-reasoning-trace                                               */
/* ================================================================== */

export const SOC_REASONING_TRACE_SCHEMA_VERSION = 1;

export const ReasoningTraceEventSchema = z
  .object({
    '@timestamp': isoTimestampSchema.optional(),
    corpus_id: nonEmptyString,
    rule_id: nonEmptyString,
    advisory_id: nonEmptyString,
    axis: variantAxisSchema,
    platform: targetPlatformSchema,
    variant_index: z.number().int().min(0),
    accepted: z.boolean(),
    reasons: z.array(z.string()),
    rationale: z.string(),
    command_line_sample: z.string(),
    provider: nonEmptyString,
  })
  .passthrough();

export type SocReasoningTraceEvent = z.infer<typeof ReasoningTraceEventSchema>;

/* ================================================================== */
/*  .soc-evolution-log                                                 */
/* ================================================================== */

export const SOC_EVOLUTION_LOG_SCHEMA_VERSION = 1;

/**
 * Flat schema. The data stream's mapping (verified live during the F-015
 * boot) treats `agent_id`, `actor`, `trust_tier`, and `event_type` as
 * top-level keyword/text fields — NOT nested objects. The autonomous
 * driver's earlier shape (`agent: { id, version }`, `actor: { ... }`,
 * `event: 'synthesis.tick'`) failed with `document_parsing_exception:
 * Expected text at 1:133 but found START_OBJECT`.
 *
 * `metrics_snapshot` carries the rich per-tick / per-advisory payload as
 * a flexible object so tooling can evolve without a remap.
 */
export const EvolutionLogRowSchema = z
  .object({
    '@timestamp': isoTimestampSchema,
    event_type: nonEmptyString.describe(
      'Use snake_case strings like `synthesis.tick`, `synthesis.advisory`, ' +
        '`synthesis.chat_skill`. Top-level keyword field — must be a string, not an object.'
    ),
    agent_id: nonEmptyString,
    source: nonEmptyString,
    actor: nonEmptyString,
    trust_tier: z.enum(['probationary', 'scoped', 'trusted', 'frontier']),
    result: nonEmptyString,
    message: z.string(),
    metrics_snapshot: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()
  .refine(
    (row) => {
      // Reject the legacy nested shape that broke the data-stream mapping
      // during the live B1 boot (F-015 part a).
      const r = row as Record<string, unknown>;
      const hasNestedAgent =
        typeof r.agent === 'object' && r.agent !== null && !Array.isArray(r.agent);
      const hasNestedActor =
        typeof r.actor === 'object' && r.actor !== null && !Array.isArray(r.actor);
      const hasLegacyEvent = typeof r.event === 'string' && typeof r.event_type !== 'string';
      return !hasNestedAgent && !hasNestedActor && !hasLegacyEvent;
    },
    {
      message:
        '[soc-evolution-log] legacy nested shape detected (agent.id object, actor object, or `event` instead of `event_type`). ' +
        'Use flat `agent_id`, `actor`, `event_type` to match the data-stream mapping. ' +
        'See `docs/autodex/schemas/soc-evolution-log.md`.',
    }
  );

export type SocEvolutionLogRow = z.infer<typeof EvolutionLogRowSchema>;

/* ================================================================== */
/*  .soc-kill-switch                                                   */
/* ================================================================== */

export const SOC_KILL_SWITCH_SCHEMA_VERSION = 1;

export const KillSwitchDocSchema = z
  .object({
    '@timestamp': isoTimestampSchema,
    autonomy_enabled: z
      .boolean()
      .describe(
        'Cluster-wide autonomy flag. The `soc_argus_synthesis_driver.yaml` ' +
          'workflow halts when the most-recent kill-switch document has `autonomy_enabled=false`.'
      ),
    reason: z.string().optional(),
    operator: z.string().optional(),
  })
  .passthrough();

export type SocKillSwitchDocument = z.infer<typeof KillSwitchDocSchema>;

/* ================================================================== */
/*  .soc-crown-jewels                                                  */
/* ================================================================== */

/**
 * Crown-jewel asset register (B5).
 *
 * Each document represents a high-business-value asset (host, user, service,
 * data-store, or arbitrary tagged group) that AutoDEX governance must treat
 * with extra care:
 *
 *   - Detection rules whose backtested matches touch a crown-jewel asset
 *     route to `pending_review` instead of auto-applying.
 *   - The autonomous applier consults the crown-jewel index as the 12th gate
 *     in the cascade (between trust-tier and budget). When the gate would
 *     auto-apply but the affected target list intersects a crown-jewel
 *     `match_pattern`, the intent is parked on the human-review queue.
 *
 * The schema is deliberately minimal: an asset register is owner-curated and
 * the ARGUS code never invents new fields. Match patterns are explicit
 * (terms / wildcards / CIDRs) — the gate is fail-loud, not fuzzy.
 */
export const SOC_CROWN_JEWELS_SCHEMA_VERSION = 1;

const assetTierSchema = z
  .enum(['silver', 'gold', 'platinum', 'crown'])
  .describe(
    'Business-value tier. Conventionally:\n' +
      '  silver   — sensitive but not unique (paved-road production hosts).\n' +
      '  gold     — uniquely impactful (PKI roots, source of record databases).\n' +
      '  platinum — outage = customer-visible incident (payment authorisation).\n' +
      '  crown    — outage = company-existential (the actual crown jewels). The\n' +
      '             autonomous applier ALWAYS routes intents touching a `crown`\n' +
      '             asset to `pending_review`, regardless of agent trust tier.'
  );

const assetMatcherKindSchema = z.enum([
  'host_name', // matches against `host.name`
  'host_ip', // matches against `host.ip` / `source.ip` / `destination.ip`
  'host_ip_range', // CIDR; matches by inclusion
  'user_name', // matches against `user.name`
  'user_id', // matches against `user.id`
  'service_name', // matches against `service.name`
  'index_pattern', // wildcard against the rule's index patterns
  'tag', // logical group label asserted by another field (e.g. `host.tags`)
]);

const assetMatcherSchema = z
  .object({
    kind: assetMatcherKindSchema,
    values: z.array(nonEmptyString).min(1),
    /**
     * Optional. When set on a `host_ip_range` matcher, the helper treats each
     * `values[]` entry as a CIDR. For other kinds, set `match_mode` to
     * `wildcard` to enable simple `*` glob matching; the default `terms`
     * behaviour does exact-string compare.
     */
    match_mode: z.enum(['terms', 'wildcard']).optional(),
  })
  .passthrough();

export const CrownJewelDocSchema = z
  .object({
    '@timestamp': isoTimestampSchema,
    asset_id: nonEmptyString.describe(
      'Stable cluster-unique identifier. Operators control naming; ARGUS never ' +
        'invents one. Convention: `cj-<env>-<scope>-<short>` (e.g. `cj-prod-pki-root`).'
    ),
    schema_version: z.literal(SOC_CROWN_JEWELS_SCHEMA_VERSION).optional(),
    asset_type: z.enum(['host', 'user', 'service', 'data_store', 'group']),
    name: nonEmptyString,
    description: z.string().optional(),
    tier: assetTierSchema,
    owner: nonEmptyString.describe(
      'Team or individual accountable for the asset. Surfaces in the review-queue UI.'
    ),
    business_function: z.string().optional(),
    /**
     * One or more matchers describing how to recognise this asset in
     * detection-rule output. Multiple matchers OR together (any match → asset
     * is affected). Required because the gate has nothing to evaluate without
     * a matcher.
     */
    match_patterns: z.array(assetMatcherSchema).min(1),
    tags: z.array(z.string()).optional(),
    compliance_scope: z
      .array(z.enum(['pci', 'sox', 'hipaa', 'gdpr', 'iso27001', 'fedramp']))
      .optional(),
    /**
     * Operator-asserted recovery priority (1 = highest). Surfaces in the
     * audit log on the `crown_jewel_assessment.affected[]` payload so a
     * reviewer can see *why* this asset is on the list. Optional.
     */
    recovery_priority: z.number().int().min(1).max(10).optional(),
    /**
     * If false, the helper still reports the asset as matched but the
     * `recommended_action` does NOT escalate to `pending_review`. Use this
     * to register an asset for visibility without invoking the gate (e.g.
     * during onboarding before the asset is fully tagged).
     */
    gate_active: z.boolean().default(true),
  })
  .passthrough();

export type SocCrownJewelDocument = z.infer<typeof CrownJewelDocSchema>;
export type AssetTier = z.infer<typeof assetTierSchema>;
export type AssetMatcher = z.infer<typeof assetMatcherSchema>;
export type AssetMatcherKind = z.infer<typeof assetMatcherKindSchema>;

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

/**
 * Validate `doc` against `schema` and return a structured result. Used by
 * write-time guards: producers call this immediately before indexing,
 * log a structured warning on failure, and either fail closed (workflow
 * step) or fall through with a typed error (chat tool).
 *
 * Wrapping `schema.safeParse` keeps every producer's error formatting
 * identical so the audit trail attribution is consistent.
 */
export interface ContractCheckResult<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly issues?: readonly string[];
}

export const checkContract = <T>(schema: z.ZodType<T>, doc: unknown): ContractCheckResult<T> => {
  const result = schema.safeParse(doc);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  const issues = result.error.issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`);
  return { ok: false, issues };
};
