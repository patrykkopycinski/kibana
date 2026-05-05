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

import {
  DEFAULT_PREBUILT_LIFECYCLE_THRESHOLDS,
  evaluatePrebuiltLifecycle,
  resolvePrebuiltLifecycleThresholds,
} from './prebuilt_lifecycle_advisor';
import type { PrebuiltRuleSnapshot, PrebuiltRuleUpgrade } from './prebuilt_lifecycle_advisor';

const buildUpgrade = (overrides: Partial<PrebuiltRuleUpgrade> = {}): PrebuiltRuleUpgrade => ({
  target_version: '2.0.0',
  changed_fields: ['description', 'tags'],
  breaking_change: false,
  ...overrides,
});

const buildSnapshot = (overrides: Partial<PrebuiltRuleSnapshot> = {}): PrebuiltRuleSnapshot => ({
  rule_id: 'prebuilt.suspicious-powershell',
  rule_name: 'Suspicious PowerShell',
  installed_version: '1.0.0',
  base_version: '1.0.0',
  customised_fields: [],
  available_upgrade: buildUpgrade(),
  ...overrides,
});

describe('resolvePrebuiltLifecycleThresholds', () => {
  it('returns defaults when no override is supplied', () => {
    expect(resolvePrebuiltLifecycleThresholds()).toEqual(DEFAULT_PREBUILT_LIFECYCLE_THRESHOLDS);
    expect(resolvePrebuiltLifecycleThresholds(undefined)).toEqual(
      DEFAULT_PREBUILT_LIFECYCLE_THRESHOLDS
    );
  });

  it('honours partial overrides', () => {
    const result = resolvePrebuiltLifecycleThresholds({
      manual_review_conflict_floor: 5,
    });
    expect(result.manual_review_conflict_floor).toBe(5);
    expect(result.protected_fields).toEqual(DEFAULT_PREBUILT_LIFECYCLE_THRESHOLDS.protected_fields);
  });

  it('floors fractional manual_review_conflict_floor', () => {
    expect(
      resolvePrebuiltLifecycleThresholds({ manual_review_conflict_floor: 4.6 })
        .manual_review_conflict_floor
    ).toBe(4);
  });

  it('clamps manual_review_conflict_floor below 1 to 1', () => {
    expect(
      resolvePrebuiltLifecycleThresholds({ manual_review_conflict_floor: 0 })
        .manual_review_conflict_floor
    ).toBe(1);
  });

  it('falls back to default when manual_review_conflict_floor is non-finite', () => {
    expect(
      resolvePrebuiltLifecycleThresholds({ manual_review_conflict_floor: NaN })
        .manual_review_conflict_floor
    ).toBe(DEFAULT_PREBUILT_LIFECYCLE_THRESHOLDS.manual_review_conflict_floor);
  });

  it('overrides protected_fields and dedups + sorts them', () => {
    const result = resolvePrebuiltLifecycleThresholds({
      protected_fields: ['query', 'query', 'risk_score', 'severity'],
    });
    expect(result.protected_fields).toEqual(['query', 'risk_score', 'severity']);
  });

  it('treats empty protected_fields override as an explicit empty list', () => {
    const result = resolvePrebuiltLifecycleThresholds({
      protected_fields: [],
    });
    expect(result.protected_fields).toEqual([]);
  });

  it('drops non-string entries from protected_fields', () => {
    const result = resolvePrebuiltLifecycleThresholds({
      protected_fields: ['query', 42 as unknown as string, ' ', 'severity'],
    });
    expect(result.protected_fields).toEqual(['query', 'severity']);
  });
});

describe('evaluatePrebuiltLifecycle', () => {
  it('returns no_upgrade_available when no upgrade is attached', () => {
    const result = evaluatePrebuiltLifecycle(buildSnapshot({ available_upgrade: null }));
    expect(result.verdict).toBe('no_upgrade_available');
    expect(result.recommended_actions).toEqual(['log_only']);
    expect(result.proposals).toHaveLength(0);
  });

  it('returns no_upgrade_available when target_version equals installed_version', () => {
    const result = evaluatePrebuiltLifecycle(
      buildSnapshot({
        installed_version: '2.0.0',
        available_upgrade: buildUpgrade({ target_version: '2.0.0' }),
      })
    );
    expect(result.verdict).toBe('no_upgrade_available');
  });

  it('returns auto_upgrade when there are no customisations', () => {
    const result = evaluatePrebuiltLifecycle(buildSnapshot());
    expect(result.verdict).toBe('auto_upgrade');
    expect(result.recommended_actions).toEqual(['propose_upgrade']);
    expect(result.proposals[0]).toMatchObject({
      type: 'upgrade',
      target_version: '2.0.0',
      preserves_customised_fields: [],
    });
  });

  it('returns auto_upgrade when customisations do not overlap with upstream changes', () => {
    const result = evaluatePrebuiltLifecycle(
      buildSnapshot({
        customised_fields: ['severity'],
        available_upgrade: buildUpgrade({ changed_fields: ['description'] }),
      })
    );
    expect(result.verdict).toBe('auto_upgrade');
    expect(result.proposals[0]).toMatchObject({
      type: 'upgrade',
      preserves_customised_fields: ['severity'],
    });
  });

  it('returns merge_needed when local customisations conflict but no protected field is hit', () => {
    const result = evaluatePrebuiltLifecycle(
      buildSnapshot({
        customised_fields: ['description'],
        available_upgrade: buildUpgrade({ changed_fields: ['description', 'tags'] }),
      })
    );
    expect(result.verdict).toBe('merge_needed');
    expect(result.recommended_actions).toEqual(['propose_merge']);
    expect(result.proposals[0]).toMatchObject({
      type: 'merge',
      target_version: '2.0.0',
      conflicts: ['description'],
      safe_fields: ['tags'],
    });
  });

  it('returns manual_review when conflict count meets the manual_review_conflict_floor', () => {
    const result = evaluatePrebuiltLifecycle(
      buildSnapshot({
        customised_fields: ['description', 'tags', 'risk_score'],
        available_upgrade: buildUpgrade({
          changed_fields: ['description', 'tags', 'risk_score', 'severity'],
        }),
      })
    );
    expect(result.verdict).toBe('manual_review');
    expect(result.recommended_actions).toEqual(['propose_merge', 'open_review_case']);
    expect(result.proposals[0]).toMatchObject({
      type: 'merge',
      conflicts: ['description', 'risk_score', 'tags'],
      safe_fields: ['severity'],
    });
  });

  it('returns manual_review when ANY conflict touches a protected field, even if count is small', () => {
    const result = evaluatePrebuiltLifecycle(
      buildSnapshot({
        customised_fields: ['query'],
        available_upgrade: buildUpgrade({ changed_fields: ['query', 'description'] }),
      })
    );
    expect(result.verdict).toBe('manual_review');
    expect(result.proposals[0]).toMatchObject({
      type: 'merge',
      conflicts: ['query'],
      safe_fields: ['description'],
    });
  });

  it('honours per-call protected_fields override', () => {
    const result = evaluatePrebuiltLifecycle(
      buildSnapshot({
        customised_fields: ['risk_score'],
        available_upgrade: buildUpgrade({ changed_fields: ['risk_score', 'tags'] }),
      }),
      { protected_fields: ['risk_score'] }
    );
    expect(result.verdict).toBe('manual_review');
  });

  it('returns skip_breaking when upstream is breaking AND there are local customisations', () => {
    const result = evaluatePrebuiltLifecycle(
      buildSnapshot({
        customised_fields: ['severity', 'tags'],
        available_upgrade: buildUpgrade({ breaking_change: true }),
      })
    );
    expect(result.verdict).toBe('skip_breaking');
    expect(result.recommended_actions).toEqual(['propose_skip_breaking', 'open_review_case']);
    expect(result.proposals[0]).toMatchObject({
      type: 'skip_breaking',
      target_version: '2.0.0',
    });
  });

  it('does NOT skip_breaking when there are no customisations even if upstream is breaking', () => {
    const result = evaluatePrebuiltLifecycle(
      buildSnapshot({
        customised_fields: [],
        available_upgrade: buildUpgrade({ breaking_change: true }),
      })
    );
    expect(result.verdict).toBe('auto_upgrade');
  });

  it('drops non-string customised_fields entries defensively', () => {
    const result = evaluatePrebuiltLifecycle(
      buildSnapshot({
        customised_fields: ['description', null, 42, ' '] as unknown as string[],
        available_upgrade: buildUpgrade({ changed_fields: ['description'] }),
      })
    );
    expect(result.verdict).toBe('merge_needed');
  });

  it('captures all stamped thresholds in the recommendation', () => {
    const result = evaluatePrebuiltLifecycle(buildSnapshot(), {
      manual_review_conflict_floor: 5,
    });
    expect(result.thresholds_applied.manual_review_conflict_floor).toBe(5);
  });

  it('preserves rule_id and rule_name', () => {
    const result = evaluatePrebuiltLifecycle(
      buildSnapshot({ rule_id: 'p-42', rule_name: 'Prebuilt 42' })
    );
    expect(result.rule_id).toBe('p-42');
    expect(result.rule_name).toBe('Prebuilt 42');
  });

  it('produces deterministic output for the same input', () => {
    const snapshot = buildSnapshot({
      customised_fields: ['description', 'tags'],
      available_upgrade: buildUpgrade({ changed_fields: ['tags', 'description', 'severity'] }),
    });
    const a = evaluatePrebuiltLifecycle(snapshot);
    const b = evaluatePrebuiltLifecycle(snapshot);
    expect(a).toEqual(b);
  });

  it('sorts conflicts and safe_fields alphabetically', () => {
    const result = evaluatePrebuiltLifecycle(
      buildSnapshot({
        customised_fields: ['zeta', 'alpha', 'mu'],
        available_upgrade: buildUpgrade({
          changed_fields: ['mu', 'alpha', 'zeta', 'beta'],
        }),
      })
    );
    expect(result.proposals[0]).toMatchObject({
      conflicts: ['alpha', 'mu', 'zeta'],
      safe_fields: ['beta'],
    });
  });

  it('treats empty changed_fields as no conflicts', () => {
    const result = evaluatePrebuiltLifecycle(
      buildSnapshot({
        customised_fields: ['severity'],
        available_upgrade: buildUpgrade({ changed_fields: [] }),
      })
    );
    expect(result.verdict).toBe('auto_upgrade');
  });
});
