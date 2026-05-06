/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elastic B.V. and/or licensed to Elastic B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * AutoDEX B10 — Incident TTPs → Threat Intel reverse loop.
 *
 * Pure-logic adapter that turns confirmed incident TTPs (from
 * `.soc-forensic-summary` + `.soc-outcomes`) into `.soc-intel-feed`
 * emissions, so future synthesis ticks see real, observed adversary
 * behaviour as a first-class intel signal alongside KEV / Mythos /
 * generic CTI adapters.
 *
 * The vision-doc gap (1.7.4): "Incident TTPs → threat intel" was
 * one-way only — intel → rules. This module produces the missing
 * reverse direction.
 *
 * Notes:
 * - The extractor is intentionally a pure function. The workflow
 *   `soc_incident_reverse_intel.yaml` (and any future server-side
 *   driver) is responsible for fetching incidents/outcomes and
 *   bulk-indexing emissions; this module just maps inputs → emissions
 *   with no side effects.
 * - Conservative by default: a technique must clear
 *   `min_observations` confirmed sightings before any emission is
 *   produced. False positives are captured in evidence (audit trail)
 *   but do not subtract from signal strength on the first pass — they
 *   may indicate emerging variants worth grounding.
 * - Mirrors the `.soc-intel-feed` v1 contract exactly: every emission
 *   has `intel_id`, `feed_id`, `adapter`, `kind`, `reference`,
 *   `signal_strength`, `half_life_days`, `source_trust`, `observed_at`,
 *   `summary`, plus an `evidence.*` audit-trail block.
 */

export interface IncidentTtpRecord {
  readonly incident_id: string;
  readonly closed_at: string;
  readonly verdict: string;
  readonly techniques: readonly string[];
  readonly actor: string | null;
  readonly campaign: string | null;
  readonly confidence?: number;
  readonly iocs?: readonly {
    readonly type: string;
    readonly value: string;
    readonly confidence?: number;
  }[];
}

export interface OutcomeTtpRecord {
  readonly outcome_id: string;
  readonly observed_at: string;
  readonly verdict: string;
  readonly techniques_observed: readonly string[];
  readonly threat_category?: string;
  readonly kill_chain_stage?: string;
  readonly rule_id?: string;
  readonly false_positive?: boolean;
}

export interface ReverseIntelThresholds {
  readonly min_observations: number;
  readonly base_signal_strength: number;
  readonly per_extra_observation: number;
  readonly max_signal_strength: number;
  readonly half_life_days: number;
  readonly source_trust: number;
}

export const DEFAULT_REVERSE_INTEL_THRESHOLDS: ReverseIntelThresholds = {
  min_observations: 2,
  base_signal_strength: 0.4,
  per_extra_observation: 0.1,
  max_signal_strength: 0.95,
  half_life_days: 14,
  source_trust: 0.85,
};

export interface ReverseIntelEvidence {
  readonly observation_count: number;
  readonly true_positive_count: number;
  readonly false_positive_count: number;
  readonly window: { readonly from: string; readonly to: string };
  readonly distinct_actors: readonly string[];
  readonly distinct_campaigns: readonly string[];
  readonly distinct_rule_ids: readonly string[];
  readonly distinct_incident_ids: readonly string[];
}

export interface ReverseIntelEmission {
  readonly intel_id: string;
  readonly feed_id: 'soc.incident.observed';
  readonly adapter: 'soc_incident_reverse_intel';
  readonly kind: 'ttp_observed';
  readonly reference: {
    readonly technique_ids: readonly string[];
    readonly actor_ids: readonly string[];
  };
  readonly signal_strength: number;
  readonly half_life_days: number;
  readonly source_trust: number;
  readonly observed_at: string;
  readonly summary: string;
  readonly evidence: ReverseIntelEvidence;
  readonly schema_version: 1;
}

export interface ReverseIntelSkipReason {
  readonly technique_id: string;
  readonly observations: number;
  readonly reason: string;
}

export interface ExtractReverseIntelInput {
  readonly incidents: readonly IncidentTtpRecord[];
  readonly outcomes: readonly OutcomeTtpRecord[];
  readonly window: { readonly from: string; readonly to: string };
  readonly thresholds?: Partial<ReverseIntelThresholds>;
}

export interface ExtractReverseIntelResult {
  readonly emissions: readonly ReverseIntelEmission[];
  readonly skipped: readonly ReverseIntelSkipReason[];
  readonly window: { readonly from: string; readonly to: string };
  readonly thresholds_applied: ReverseIntelThresholds;
}

const TRUE_POSITIVE_VERDICTS: ReadonlySet<string> = new Set([
  'true_positive',
  'confirmed_threat',
  'confirmed',
  'malicious',
  'tp',
]);

const FALSE_POSITIVE_VERDICTS: ReadonlySet<string> = new Set(['false_positive', 'benign', 'fp']);

interface AggregateState {
  technique_id: string;
  true_positive_count: number;
  false_positive_count: number;
  observed_at_max: string;
  actors: Set<string>;
  campaigns: Set<string>;
  rule_ids: Set<string>;
  incident_ids: Set<string>;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const clampUnit = (value: number): number => {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

/**
 * Resolves a unit-bounded number (intended range `[0, 1]`).
 * - Non-finite (NaN, Infinity, undefined, non-number) → fallback default.
 * - Otherwise → clamp into `[0, 1]`. Out-of-range values are clamped, not
 *   replaced with the default; the caller's intent ("source_trust=-0.5
 *   means zero trust") is preserved.
 */
const resolveUnitNumber = (value: unknown, fallback: number): number => {
  if (!isFiniteNumber(value)) return fallback;
  return clampUnit(value);
};

/**
 * Resolves a positive-integer threshold.
 * - Non-finite → fallback default.
 * - Otherwise → floor and clamp at the supplied minimum (defaults to 1).
 */
const resolvePositiveInt = (
  value: unknown,
  fallback: number,
  { min = 1 }: { min?: number } = {}
): number => {
  if (!isFiniteNumber(value)) return fallback;
  const floored = Math.floor(value);
  return floored < min ? min : floored;
};

export const resolveReverseIntelThresholds = (
  override?: Partial<ReverseIntelThresholds>
): ReverseIntelThresholds => {
  if (!override) return DEFAULT_REVERSE_INTEL_THRESHOLDS;
  const minObservations = resolvePositiveInt(
    override.min_observations,
    DEFAULT_REVERSE_INTEL_THRESHOLDS.min_observations
  );
  const baseSignalStrength = resolveUnitNumber(
    override.base_signal_strength,
    DEFAULT_REVERSE_INTEL_THRESHOLDS.base_signal_strength
  );
  const maxSignalStrength = resolveUnitNumber(
    override.max_signal_strength,
    DEFAULT_REVERSE_INTEL_THRESHOLDS.max_signal_strength
  );
  const perExtraObservation = resolveUnitNumber(
    override.per_extra_observation,
    DEFAULT_REVERSE_INTEL_THRESHOLDS.per_extra_observation
  );
  const halfLifeDays = resolvePositiveInt(
    override.half_life_days,
    DEFAULT_REVERSE_INTEL_THRESHOLDS.half_life_days
  );
  const sourceTrust = resolveUnitNumber(
    override.source_trust,
    DEFAULT_REVERSE_INTEL_THRESHOLDS.source_trust
  );
  return {
    min_observations: minObservations,
    base_signal_strength: baseSignalStrength,
    max_signal_strength: Math.max(maxSignalStrength, baseSignalStrength),
    per_extra_observation: perExtraObservation,
    half_life_days: halfLifeDays,
    source_trust: sourceTrust,
  };
};

const isoOrFallback = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return fallback;
  return value;
};

const computeSignalStrength = (
  trueObservations: number,
  thresholds: ReverseIntelThresholds
): number => {
  const extras = Math.max(0, trueObservations - 1);
  const raw = thresholds.base_signal_strength + extras * thresholds.per_extra_observation;
  return Math.min(thresholds.max_signal_strength, clampUnit(raw));
};

const formatSummary = (
  techniqueId: string,
  state: AggregateState,
  windowFrom: string,
  windowTo: string
): string => {
  const actorList = state.actors.size > 0 ? Array.from(state.actors).sort().join(', ') : 'unknown';
  return [
    `Technique ${techniqueId} observed ${state.true_positive_count} time(s)`,
    state.false_positive_count > 0 ? `(plus ${state.false_positive_count} false positive(s))` : '',
    `between ${windowFrom} and ${windowTo} —`,
    `actors: ${actorList};`,
    `incidents: ${state.incident_ids.size};`,
    `triggering rules: ${state.rule_ids.size}.`,
  ]
    .filter(Boolean)
    .join(' ');
};

const sortedFromSet = (input: Set<string>): readonly string[] =>
  Array.from(input)
    .filter((entry) => entry.length > 0)
    .sort();

const upsertAggregate = (acc: Map<string, AggregateState>, techniqueId: string): AggregateState => {
  const trimmed = techniqueId.trim();
  if (trimmed.length === 0) {
    return {
      technique_id: '',
      true_positive_count: 0,
      false_positive_count: 0,
      observed_at_max: '',
      actors: new Set(),
      campaigns: new Set(),
      rule_ids: new Set(),
      incident_ids: new Set(),
    };
  }
  const existing = acc.get(trimmed);
  if (existing) return existing;
  const fresh: AggregateState = {
    technique_id: trimmed,
    true_positive_count: 0,
    false_positive_count: 0,
    observed_at_max: '',
    actors: new Set(),
    campaigns: new Set(),
    rule_ids: new Set(),
    incident_ids: new Set(),
  };
  acc.set(trimmed, fresh);
  return fresh;
};

const updateMaxObservedAt = (state: AggregateState, candidate: string): void => {
  if (!candidate) return;
  if (!state.observed_at_max || candidate > state.observed_at_max) {
    state.observed_at_max = candidate;
  }
};

const normaliseTechniqueIds = (raw: unknown): readonly string[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const ingestIncident = (acc: Map<string, AggregateState>, incident: IncidentTtpRecord): void => {
  const techniques = normaliseTechniqueIds(incident.techniques);
  if (techniques.length === 0) return;
  const verdictKey = incident.verdict?.toLowerCase?.() ?? '';
  const isTp = TRUE_POSITIVE_VERDICTS.has(verdictKey);
  const isFp = FALSE_POSITIVE_VERDICTS.has(verdictKey);
  if (!isTp && !isFp) return;
  const closedAt = typeof incident.closed_at === 'string' ? incident.closed_at : '';
  techniques.forEach((trimmed) => {
    const state = upsertAggregate(acc, trimmed);
    if (state.technique_id.length === 0) return;
    if (isTp) {
      state.true_positive_count += 1;
    } else {
      state.false_positive_count += 1;
    }
    updateMaxObservedAt(state, closedAt);
    if (incident.actor) state.actors.add(incident.actor);
    if (incident.campaign) state.campaigns.add(incident.campaign);
    if (incident.incident_id) state.incident_ids.add(incident.incident_id);
  });
};

const ingestOutcome = (acc: Map<string, AggregateState>, outcome: OutcomeTtpRecord): void => {
  const techniques = normaliseTechniqueIds(outcome.techniques_observed);
  if (techniques.length === 0) return;
  const verdictKey = outcome.verdict?.toLowerCase?.() ?? '';
  const explicitFp = outcome.false_positive === true;
  const isFp = explicitFp || FALSE_POSITIVE_VERDICTS.has(verdictKey);
  const isTp = !explicitFp && TRUE_POSITIVE_VERDICTS.has(verdictKey);
  if (!isTp && !isFp) return;
  const observedAt = typeof outcome.observed_at === 'string' ? outcome.observed_at : '';
  techniques.forEach((trimmed) => {
    const state = upsertAggregate(acc, trimmed);
    if (state.technique_id.length === 0) return;
    if (isTp) {
      state.true_positive_count += 1;
    } else {
      state.false_positive_count += 1;
    }
    updateMaxObservedAt(state, observedAt);
    if (outcome.rule_id) state.rule_ids.add(outcome.rule_id);
  });
};

export const extractReverseIntel = (input: ExtractReverseIntelInput): ExtractReverseIntelResult => {
  const thresholds = resolveReverseIntelThresholds(input.thresholds);
  const windowFrom = isoOrFallback(input.window?.from, '');
  const windowTo = isoOrFallback(input.window?.to, '');
  const acc = new Map<string, AggregateState>();

  if (Array.isArray(input.incidents)) {
    for (const incident of input.incidents) {
      ingestIncident(acc, incident);
    }
  }
  if (Array.isArray(input.outcomes)) {
    for (const outcome of input.outcomes) {
      ingestOutcome(acc, outcome);
    }
  }

  const emissions: ReverseIntelEmission[] = [];
  const skipped: ReverseIntelSkipReason[] = [];

  const sortedTechniqueIds = Array.from(acc.keys()).sort();
  sortedTechniqueIds.forEach((techniqueId) => {
    const state = acc.get(techniqueId);
    if (!state) return;
    const totalObservations = state.true_positive_count + state.false_positive_count;
    if (state.true_positive_count < thresholds.min_observations) {
      skipped.push({
        technique_id: techniqueId,
        observations: totalObservations,
        reason: `below min_observations=${thresholds.min_observations} (true_positives=${state.true_positive_count})`,
      });
      return;
    }
    const observedAt = state.observed_at_max || windowTo || windowFrom;
    const observedAtIso = isoOrFallback(observedAt, windowTo || windowFrom);
    const summary = formatSummary(techniqueId, state, windowFrom, windowTo);
    const intelId = `incident-rev-${techniqueId}-${observedAtIso}`;
    const distinctActors = sortedFromSet(state.actors);
    const distinctCampaigns = sortedFromSet(state.campaigns);
    const distinctRuleIds = sortedFromSet(state.rule_ids);
    const distinctIncidentIds = sortedFromSet(state.incident_ids);
    emissions.push({
      intel_id: intelId,
      feed_id: 'soc.incident.observed',
      adapter: 'soc_incident_reverse_intel',
      kind: 'ttp_observed',
      reference: {
        technique_ids: [techniqueId],
        actor_ids: distinctActors,
      },
      signal_strength: computeSignalStrength(state.true_positive_count, thresholds),
      half_life_days: thresholds.half_life_days,
      source_trust: thresholds.source_trust,
      observed_at: observedAtIso,
      summary,
      evidence: {
        observation_count: totalObservations,
        true_positive_count: state.true_positive_count,
        false_positive_count: state.false_positive_count,
        window: { from: windowFrom, to: windowTo },
        distinct_actors: distinctActors,
        distinct_campaigns: distinctCampaigns,
        distinct_rule_ids: distinctRuleIds,
        distinct_incident_ids: distinctIncidentIds,
      },
      schema_version: 1,
    });
  });

  return {
    emissions,
    skipped,
    window: { from: windowFrom, to: windowTo },
    thresholds_applied: thresholds,
  };
};
