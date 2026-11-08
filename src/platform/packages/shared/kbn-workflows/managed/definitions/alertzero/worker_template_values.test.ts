/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parse } from 'yaml';
import DETECTION_RULE_COVERAGE_YAML from './detection_rule_coverage.yaml';
import DETECTION_RULE_TUNING_YAML from './detection_rule_tuning.yaml';
import FLOOR_ALERT_TRIAGE_YAML from './floor_alert_triage.yaml';
import FLOOR_ATTACK_DISCOVERY_YAML from './floor_attack_discovery.yaml';
import FORENSICS_ENDPOINT_ANALYSIS_YAML from './forensics_endpoint_analysis.yaml';
import HUNT_CONTINUOUS_THREAT_HUNT_YAML from './hunt/hunt_continuous_threat_hunt.yaml';
import { renderHuntWorkerYaml } from './hunt/hunt_worker_template';
import {
  attackDiscoveryMaxAlerts,
  renderAlertTriageWorkerYaml,
  renderAttackDiscoveryWorkerYaml,
  renderCommonWorkerYaml,
  renderRuleCoverageWorkerYaml,
  renderRuleTuningWorkerYaml,
} from './worker_template_values';

const HOSTILE_ID = 'we"ird: id\n#x/kibana';

const shared = { settingsVersion: 1, autonomyLevel: 'manual' as const };

const workers: Array<[string, (serviceAccountId?: string) => string]> = [
  [
    'Alert Triage',
    (serviceAccountId) =>
      renderAlertTriageWorkerYaml(FLOOR_ALERT_TRIAGE_YAML, {
        ...shared,
        scheduleInterval: '15m',
        extras: {
          autoCloseConfidenceScoreMinThreshold: 0.85,
          budgetPerHour: 1300,
          lookbackHours: 24,
          minSeverity: 'low',
          excludeBuildingBlocks: false,
          excludedRuleTags: [],
        },
        serviceAccountId,
      }),
  ],
  [
    'Attack Discovery',
    (serviceAccountId) =>
      renderAttackDiscoveryWorkerYaml(FLOOR_ATTACK_DISCOVERY_YAML, {
        ...shared,
        scheduleInterval: '24h',
        serviceAccountId,
      }),
  ],
  [
    'Endpoint analysis',
    (serviceAccountId) =>
      renderCommonWorkerYaml(FORENSICS_ENDPOINT_ANALYSIS_YAML, { ...shared, serviceAccountId }),
  ],
  [
    'Rule Tuning',
    (serviceAccountId) =>
      renderRuleTuningWorkerYaml(DETECTION_RULE_TUNING_YAML, {
        ...shared,
        scheduleInterval: '2h',
        extras: { analysisWindowDays: 7, fpCountThreshold: 10, fpRateThresholdPct: 50 },
        serviceAccountId,
      }),
  ],
  [
    'Rule Coverage',
    (serviceAccountId) =>
      renderRuleCoverageWorkerYaml(DETECTION_RULE_COVERAGE_YAML, {
        ...shared,
        scheduleInterval: '1h',
        extras: { lookbackDays: 14, maxGapsPerRun: 5 },
        serviceAccountId,
      }),
  ],
];

const settingsOf = (yaml: string): unknown => {
  const parsed = parse(yaml) as { settings?: unknown };
  return parsed.settings;
};

describe('renderRunAs', () => {
  it.each(workers)(
    'renders %s settings as an object when no account is stored',
    (_name, render) => {
      expect(settingsOf(render())).toEqual(expect.any(Object));
    }
  );

  it.each(workers)('omits run_as from %s when no account is stored', (_name, render) => {
    const settings = settingsOf(render()) as { run_as?: string };

    expect(settings.run_as).toBeUndefined();
  });

  it.each(workers)('round-trips a quoted %s service account id', (_name, render) => {
    const settings = settingsOf(render(HOSTILE_ID)) as { run_as?: string };

    expect(settings.run_as).toBe(HOSTILE_ID);
  });
});

describe('Attack Discovery alert cap', () => {
  it.each([
    ['1m', 100],
    ['15m', 104],
    ['1h', 416],
    ['2h', 833],
    ['143m', 993],
    ['24h', 10000],
    ['1d', 10000],
    ['2d', 10000],
  ])('prorates %s to %i alerts', (interval, alerts) => {
    expect(attackDiscoveryMaxAlerts(interval)).toBe(alerts);
  });

  it('renders the cap into the floor worker and leaves no placeholder behind', () => {
    const rendered = renderAttackDiscoveryWorkerYaml(FLOOR_ATTACK_DISCOVERY_YAML, {
      ...shared,
      scheduleInterval: '1h',
    });

    expect(rendered).not.toMatch(/__WORKER_[A-Z0-9_]+__/);
    expect(
      (parse(rendered) as { consts: { worker_settings: { maxAlerts: number } } }).consts
        .worker_settings.maxAlerts
    ).toBe(416);
    expect((parse(rendered) as { settings: { timeout: string } }).settings.timeout).toBe('12h');
  });
});

describe('Alert Triage sweep rendering', () => {
  const render = (scheduleInterval: string, excludedRuleTags: string[] = []) =>
    renderAlertTriageWorkerYaml(FLOOR_ALERT_TRIAGE_YAML, {
      ...shared,
      scheduleInterval,
      extras: {
        autoCloseConfidenceScoreMinThreshold: 0.85,
        budgetPerHour: 1300,
        lookbackHours: 24,
        minSeverity: 'low',
        excludeBuildingBlocks: false,
        excludedRuleTags,
      },
    });

  it.each([
    ['15m', 15],
    ['2h', 120],
    ['1d', 1440],
  ])('renders the %s interval as %i minutes for the budget per sweep', (interval, minutes) => {
    const rendered = parse(render(interval)) as {
      triggers: Array<{ type: string; with?: { every: string } }>;
      consts: { schedule_interval_minutes: number };
    };

    expect(rendered.triggers.find(({ type }) => type === 'scheduled')?.with?.every).toBe(interval);
    expect(rendered.consts.schedule_interval_minutes).toBe(minutes);
  });

  it('renders the settings under consts and leaves no placeholder behind', () => {
    const rendered = render('15m');

    expect(rendered).not.toMatch(/__WORKER_[A-Z_]+__/);
    expect(
      (parse(rendered) as { consts: { worker_settings: { extras: unknown } } }).consts
        .worker_settings.extras
    ).toEqual({
      autoCloseConfidenceScoreMinThreshold: 0.85,
      budgetPerHour: 1300,
      lookbackHours: 24,
      minSeverity: 'low',
      excludeBuildingBlocks: false,
      excludedRuleTags: [],
    });
  });

  // Rule tags are free-form, and `$` sequences in a string replacement are expanded: `price$$`
  // would silently become `price$` and stop matching, and `$'` would splice YAML into the document.
  it.each(['price$$', "a$'b", 'x$`y', '$&', '$1'])(
    'renders the excluded rule tag %s exactly as typed',
    (tag) => {
      const rendered = render('15m', [tag]);

      expect(
        (
          parse(rendered) as {
            consts: { worker_settings: { extras: { excludedRuleTags: string[] } } };
          }
        ).consts.worker_settings.extras.excludedRuleTags
      ).toEqual([tag]);
    }
  );

  it('rejects an interval the settings schema would not allow', () => {
    expect(() => render('90s')).toThrow(/Unsupported schedule interval/);
  });
});

describe('Detonate prototype entry gate rendering', () => {
  const render = (detonatePrototypeDev?: boolean) =>
    renderRuleCoverageWorkerYaml(DETECTION_RULE_COVERAGE_YAML, {
      ...shared,
      scheduleInterval: '1h',
      extras: { lookbackDays: 14, maxGapsPerRun: 5 },
      ...(detonatePrototypeDev === undefined ? {} : { detonatePrototypeDev }),
    });

  it('renders the gate as the boolean true when the dev setting is on', () => {
    const consts = (parse(render(true)) as { consts: Record<string, unknown> }).consts;

    expect(consts.detonate_prototype_dev).toBe(true);
  });

  it('renders the gate as the boolean false when the dev setting is off', () => {
    const consts = (parse(render(false)) as { consts: Record<string, unknown> }).consts;

    expect(consts.detonate_prototype_dev).toBe(false);
  });

  // Missing is the fresh-install and cross-plugin re-render case: anything but an explicit
  // boolean would render the literal token or a quoted string into the condition.
  it('defaults a missing gate to the boolean false, leaving no token behind', () => {
    const rendered = render();
    const consts = (parse(rendered) as { consts: Record<string, unknown> }).consts;

    expect(consts.detonate_prototype_dev).toBe(false);
    expect(rendered).not.toContain('__DETONATE_PROTOTYPE_DEV__');
  });

  it('renders the detached Detonate entry step with the literal workflow id', () => {
    const steps = (
      parse(render(true)) as {
        steps: Array<{ name: string; with?: Record<string, unknown> }>;
      }
    ).steps;
    const dispatch = steps.find(({ name }) => name === 'dispatch_detonate_coverage_gap');

    expect(dispatch?.with).toEqual({
      'workflow-id': 'system-security-detonate-coverage-gap',
      'run-as-mode': 'inherit',
    });
  });

  it('renders the Hunt worker gate too, ready for the P1.3 ioc-hunt dispatch', () => {
    const consts = (
      parse(
        renderHuntWorkerYaml(HUNT_CONTINUOUS_THREAT_HUNT_YAML, {
          ...shared,
          scheduleInterval: '4h',
          detonatePrototypeDev: true,
        })
      ) as { consts: Record<string, unknown> }
    ).consts;

    expect(consts.detonate_prototype_dev).toBe(true);
  });

  it('renders the detached Detonate ioc-hunt entry step with the literal workflow id', () => {
    const steps = (
      parse(
        renderHuntWorkerYaml(HUNT_CONTINUOUS_THREAT_HUNT_YAML, {
          ...shared,
          scheduleInterval: '4h',
          detonatePrototypeDev: true,
        })
      ) as { steps: Array<{ name: string; if?: string; with?: Record<string, unknown> }> }
    ).steps;
    const dispatch = steps.find(({ name }) => name === 'dispatch_detonate_ioc_hunt');

    expect(dispatch?.if).toBe('${{ consts.detonate_prototype_dev }}');
    expect(dispatch?.with).toEqual({
      'workflow-id': 'system-security-detonate-ioc-hunt',
      'run-as-mode': 'inherit',
    });
  });
});
