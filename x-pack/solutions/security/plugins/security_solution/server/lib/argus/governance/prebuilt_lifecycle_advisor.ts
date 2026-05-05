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
 * AutoDEX B8 — Prebuilt Rule Lifecycle (epic 17093) — pure-logic core.
 *
 * Given a locally-installed prebuilt rule (potentially customised) and
 * the next available upstream version, decide whether the upgrade can
 * apply automatically, needs a merge, or must be deferred to manual
 * review. Emit a structured verdict the chat skill (and the autonomous
 * lifecycle workflow that will consume the same helper) can act on.
 *
 * Verdict matrix:
 *
 *   no_upgrade_available : `available_upgrade` is null / same version.
 *   skip_breaking        : upstream advertises a breaking change AND
 *                          the user has any customisation that would
 *                          be lost; halt.
 *   auto_upgrade         : no overlap between local customisations and
 *                          upstream's changed fields, OR no
 *                          customisations at all. Safe to apply.
 *   merge_needed         : local customisations overlap with at least
 *                          one upstream-changed field but the count is
 *                          below `manual_review_conflict_floor` —
 *                          chat skill can offer a 3-way merge.
 *   manual_review        : conflict count meets the manual-review
 *                          floor, OR a customisation touches one of
 *                          the `protected_fields` (typically
 *                          `query` / `threshold` — anything that
 *                          would change the rule's detection surface).
 *
 * Each verdict carries one or more closed-set actions:
 *
 *   log_only        | open_review_case
 *   propose_upgrade | propose_merge | propose_skip_breaking
 */

export interface PrebuiltRuleSnapshot {
  readonly rule_id: string;
  readonly rule_name: string;
  readonly installed_version: string;
  readonly base_version: string;
  readonly customised_fields: readonly string[];
  readonly available_upgrade: PrebuiltRuleUpgrade | null;
}

export interface PrebuiltRuleUpgrade {
  readonly target_version: string;
  readonly changed_fields: readonly string[];
  readonly breaking_change: boolean;
  readonly summary?: string;
}

export type PrebuiltLifecycleVerdict =
  | 'no_upgrade_available'
  | 'auto_upgrade'
  | 'merge_needed'
  | 'manual_review'
  | 'skip_breaking';

export type PrebuiltLifecycleAction =
  | 'log_only'
  | 'open_review_case'
  | 'propose_upgrade'
  | 'propose_merge'
  | 'propose_skip_breaking';

export interface PrebuiltLifecycleThresholds {
  readonly manual_review_conflict_floor: number;
  readonly protected_fields: readonly string[];
}

export const DEFAULT_PREBUILT_LIFECYCLE_THRESHOLDS: PrebuiltLifecycleThresholds = {
  manual_review_conflict_floor: 3,
  protected_fields: ['query', 'threshold', 'language', 'index', 'type'],
};

export interface PrebuiltLifecycleProposalUpgrade {
  readonly type: 'upgrade';
  readonly target_version: string;
  readonly preserves_customised_fields: readonly string[];
}

export interface PrebuiltLifecycleProposalMerge {
  readonly type: 'merge';
  readonly target_version: string;
  readonly conflicts: readonly string[];
  readonly safe_fields: readonly string[];
}

export interface PrebuiltLifecycleProposalSkipBreaking {
  readonly type: 'skip_breaking';
  readonly target_version: string;
  readonly reason: string;
}

export type PrebuiltLifecycleProposal =
  | PrebuiltLifecycleProposalUpgrade
  | PrebuiltLifecycleProposalMerge
  | PrebuiltLifecycleProposalSkipBreaking;

export interface PrebuiltLifecycleRecommendation {
  readonly rule_id: string;
  readonly rule_name: string;
  readonly verdict: PrebuiltLifecycleVerdict;
  readonly reasons: readonly string[];
  readonly recommended_actions: readonly PrebuiltLifecycleAction[];
  readonly proposals: readonly PrebuiltLifecycleProposal[];
  readonly snapshot: PrebuiltRuleSnapshot;
  readonly thresholds_applied: PrebuiltLifecycleThresholds;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const resolvePositiveInt = (value: unknown, fallback: number, min = 1): number => {
  if (!isFiniteNumber(value)) return fallback;
  const floored = Math.floor(value);
  return floored < min ? min : floored;
};

const normaliseStringList = (value: unknown): readonly string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const sortedUnique = (values: readonly string[]): readonly string[] =>
  Array.from(new Set(values)).sort();

export const resolvePrebuiltLifecycleThresholds = (
  override?: Partial<PrebuiltLifecycleThresholds>
): PrebuiltLifecycleThresholds => {
  if (!override) return DEFAULT_PREBUILT_LIFECYCLE_THRESHOLDS;
  const manualReviewFloor = resolvePositiveInt(
    override.manual_review_conflict_floor,
    DEFAULT_PREBUILT_LIFECYCLE_THRESHOLDS.manual_review_conflict_floor
  );
  const protectedFields =
    override.protected_fields !== undefined
      ? sortedUnique(normaliseStringList(override.protected_fields))
      : DEFAULT_PREBUILT_LIFECYCLE_THRESHOLDS.protected_fields;
  return {
    manual_review_conflict_floor: manualReviewFloor,
    protected_fields: protectedFields,
  };
};

const intersect = (a: readonly string[], b: readonly string[]): readonly string[] => {
  const setB = new Set(b);
  return Array.from(new Set(a.filter((entry) => setB.has(entry)))).sort();
};

const difference = (a: readonly string[], b: readonly string[]): readonly string[] => {
  const setB = new Set(b);
  return Array.from(new Set(a.filter((entry) => !setB.has(entry)))).sort();
};

const buildNoUpgrade = (
  snapshot: PrebuiltRuleSnapshot,
  thresholds: PrebuiltLifecycleThresholds,
  reason: string
): PrebuiltLifecycleRecommendation => ({
  rule_id: snapshot.rule_id,
  rule_name: snapshot.rule_name,
  verdict: 'no_upgrade_available',
  reasons: [reason],
  recommended_actions: ['log_only'],
  proposals: [],
  snapshot,
  thresholds_applied: thresholds,
});

export const evaluatePrebuiltLifecycle = (
  rawSnapshot: PrebuiltRuleSnapshot,
  thresholdsOverride?: Partial<PrebuiltLifecycleThresholds>
): PrebuiltLifecycleRecommendation => {
  const thresholds = resolvePrebuiltLifecycleThresholds(thresholdsOverride);
  const customisedFields = normaliseStringList(rawSnapshot.customised_fields);
  const snapshot: PrebuiltRuleSnapshot = {
    ...rawSnapshot,
    customised_fields: customisedFields,
  };

  if (!snapshot.available_upgrade) {
    return buildNoUpgrade(snapshot, thresholds, 'no available_upgrade attached to snapshot');
  }
  const upgrade = snapshot.available_upgrade;
  const changedFields = normaliseStringList(upgrade.changed_fields);
  if (upgrade.target_version === snapshot.installed_version) {
    return buildNoUpgrade(
      snapshot,
      thresholds,
      `installed_version ${snapshot.installed_version} already at target ${upgrade.target_version}`
    );
  }

  const conflicts = intersect(customisedFields, changedFields);
  const safeFields = difference(changedFields, customisedFields);
  const protectedConflicts = intersect(conflicts, thresholds.protected_fields);

  if (upgrade.breaking_change && customisedFields.length > 0) {
    const proposal: PrebuiltLifecycleProposalSkipBreaking = {
      type: 'skip_breaking',
      target_version: upgrade.target_version,
      reason: 'upstream marked breaking_change=true and local customisations would be lost',
    };
    return {
      rule_id: snapshot.rule_id,
      rule_name: snapshot.rule_name,
      verdict: 'skip_breaking',
      reasons: [
        `upstream version ${upgrade.target_version} marked breaking_change=true`,
        `${customisedFields.length} local customisation(s) would be lost on upgrade`,
      ],
      recommended_actions: ['propose_skip_breaking', 'open_review_case'],
      proposals: [proposal],
      snapshot,
      thresholds_applied: thresholds,
    };
  }

  if (conflicts.length === 0) {
    const proposal: PrebuiltLifecycleProposalUpgrade = {
      type: 'upgrade',
      target_version: upgrade.target_version,
      preserves_customised_fields: customisedFields,
    };
    return {
      rule_id: snapshot.rule_id,
      rule_name: snapshot.rule_name,
      verdict: 'auto_upgrade',
      reasons: [
        customisedFields.length === 0
          ? `no local customisations; upgrading from ${snapshot.installed_version} to ${upgrade.target_version} is safe`
          : `local customisations [${customisedFields.join(
              ', '
            )}] do not overlap with upstream changes`,
      ],
      recommended_actions: ['propose_upgrade'],
      proposals: [proposal],
      snapshot,
      thresholds_applied: thresholds,
    };
  }

  if (
    protectedConflicts.length > 0 ||
    conflicts.length >= thresholds.manual_review_conflict_floor
  ) {
    const proposal: PrebuiltLifecycleProposalMerge = {
      type: 'merge',
      target_version: upgrade.target_version,
      conflicts,
      safe_fields: safeFields,
    };
    return {
      rule_id: snapshot.rule_id,
      rule_name: snapshot.rule_name,
      verdict: 'manual_review',
      reasons:
        protectedConflicts.length > 0
          ? [`conflicts touch protected fields [${protectedConflicts.join(', ')}]`]
          : [
              `conflict count ${conflicts.length} >= manual_review_conflict_floor ${thresholds.manual_review_conflict_floor}`,
            ],
      recommended_actions: ['propose_merge', 'open_review_case'],
      proposals: [proposal],
      snapshot,
      thresholds_applied: thresholds,
    };
  }

  const proposal: PrebuiltLifecycleProposalMerge = {
    type: 'merge',
    target_version: upgrade.target_version,
    conflicts,
    safe_fields: safeFields,
  };
  return {
    rule_id: snapshot.rule_id,
    rule_name: snapshot.rule_name,
    verdict: 'merge_needed',
    reasons: [
      `${conflicts.length} non-protected conflict(s) [${conflicts.join(
        ', '
      )}] — chat skill can offer a 3-way merge`,
    ],
    recommended_actions: ['propose_merge'],
    proposals: [proposal],
    snapshot,
    thresholds_applied: thresholds,
  };
};
