/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { DetonateCorpusEntry, DetonateCorpusLabel, DetonateCorpusTask } from './types';

interface CorpusFile {
  generatedAt: string;
  note: string;
  counts: Record<string, number>;
  entries: Array<{ id: string; label: DetonateCorpusLabel; task: DetonateCorpusTask }>;
}

const totalAlerts = (t: DetonateCorpusTask): number =>
  (t.production_endpoint_alerts_count ??
    t.production_endpoint_alert_groups.reduce((s, g) => s + g.alerts_count, 0)) +
  (t.diagnostic_endpoint_alerts_count ??
    t.diagnostic_endpoint_alert_groups.reduce((s, g) => s + g.alerts_count, 0)) +
  (t.production_detection_alerts_count ??
    t.production_detection_alert_groups.reduce((s, g) => s + g.alerts_count, 0));

/** Hard evidence per the evidence rule: production endpoint or detection alerts. */
const hasHardEvidence = (t: DetonateCorpusTask): boolean =>
  (t.production_endpoint_alerts_count ??
    t.production_endpoint_alert_groups.reduce((s, g) => s + g.alerts_count, 0)) > 0 ||
  (t.production_detection_alerts_count ??
    t.production_detection_alert_groups.reduce((s, g) => s + g.alerts_count, 0)) > 0;

const isComplete = (t: DetonateCorpusTask): boolean =>
  t.last_worker_name === 'detonate.workers.make_summary' && t.last_worker_status === 'success';

/**
 * A label must agree with the recorded task, or the corpus is lying about its
 * ground truth and every rate computed from it is meaningless. Checked here
 * rather than trusted from the generator, because the corpus is a committed
 * artifact that can drift from the generator.
 */
const assertLabelMatchesTask = (entry: DetonateCorpusEntry): void => {
  const { label, task, id } = entry;
  const alerts = totalAlerts(task);

  if (label === 'known_good_quiet') {
    if (!isComplete(task) || alerts !== 0) {
      throw new Error(
        `corpus entry ${id} labelled known_good_quiet is not a completed zero-alert run ` +
          `(complete=${isComplete(task)}, alerts=${alerts})`
      );
    }
    return;
  }
  if (label === 'known_malicious') {
    if (!hasHardEvidence(task)) {
      throw new Error(
        `corpus entry ${id} labelled known_malicious has no production/detection alerts`
      );
    }
    return;
  }
  // Evasive/no-op covers failed runs and runs that raised nothing hard; both
  // must carry zero hard evidence, or "malicious" would be the correct summary.
  if (label === 'evasive_no_alerts') {
    if (hasHardEvidence(task)) {
      throw new Error(
        `corpus entry ${id} labelled evasive_no_alerts has production/detection alerts ` +
          `(status=${task.last_worker_status})`
      );
    }
    return;
  }
  throw new Error(`corpus entry ${id} has unknown label ${String(label)}`);
};

export const loadDetonateCorpus = (fixturePath?: string): DetonateCorpusEntry[] => {
  const path = fixturePath ?? join(__dirname, '..', 'evals', 'fixtures', 'detonate_summary_corpus.json');
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as CorpusFile;

  if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) {
    throw new Error(`corpus at ${path} has no entries`);
  }
  for (const entry of parsed.entries) assertLabelMatchesTask(entry);

  return parsed.entries;
};

/**
 * One-sided 95% upper bound on a failure rate. For 0 failures this is the
 * exact Clopper-Pearson bound 1 - 0.05^(1/n) (the "rule of three": 0/300 ->
 * 0.99%), which is what the O10 "0 on ≥300 ⇒ ≤1%" criterion means. For k > 0
 * it falls back to the one-sided Wilson bound (z = 1.645), which is
 * conservative enough for reporting; the gate itself requires k = 0.
 */
export const upperBound95 = (failures: number, n: number): number => {
  if (n === 0) return 1;
  if (failures === 0) return 1 - Math.pow(0.05, 1 / n);
  const z = 1.645;
  const p = failures / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return Math.min(1, (centre + spread) / denom);
};
