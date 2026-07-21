/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ALERT_ANALYSIS_HARD_CASE_ALERTS } from './hard_case_alerts';
import { ALERT_ANALYSIS_EVAL_ALERTS } from './synthetic_alerts';
import { CLASSIFICATIONS } from './constants';

describe('ALERT_ANALYSIS_HARD_CASE_ALERTS', () => {
  it('provides a mix of stealthy true_positive and convincing-noise false_positive cases', () => {
    const labels = ALERT_ANALYSIS_HARD_CASE_ALERTS.map((a) => a.expected);
    const counts = labels.reduce<Record<string, number>>((acc, l) => {
      acc[l] = (acc[l] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts.true_positive).toBeGreaterThan(0);
    expect(counts.false_positive).toBeGreaterThan(0);
  });

  it('uses valid classifications and non-empty descriptions', () => {
    for (const alert of ALERT_ANALYSIS_HARD_CASE_ALERTS) {
      expect(CLASSIFICATIONS).toContain(alert.expected);
      expect(alert.description.length).toBeGreaterThan(20);
    }
  });

  it('does not collide with base alert ids', () => {
    const baseIds = new Set(ALERT_ANALYSIS_EVAL_ALERTS.map((a) => a.id));
    for (const alert of ALERT_ANALYSIS_HARD_CASE_ALERTS) {
      expect(baseIds.has(alert.id)).toBe(false);
    }
  });

  it('indexes each alert doc with matching uuid', () => {
    for (const alert of ALERT_ANALYSIS_HARD_CASE_ALERTS) {
      expect(alert.doc['kibana.alert.uuid']).toBe(alert.id);
    }
  });

  it('has no duplicate ids within the hard-case set', () => {
    const ids = ALERT_ANALYSIS_HARD_CASE_ALERTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
