/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BoundInferenceClient } from '@kbn/inference-common';
import { MessageRole } from '@kbn/inference-common';
import type { ToolingLog } from '@kbn/tooling-log';

import type { DetonateCorpusEntry, DetonateSummaryOutput } from './types';

/** Deterministic parts of the skill prompt that carry the evidence rule. */
export const SUMMARY_SYSTEM_PROMPT_HEAD = `You are a security analyst assistant reporting on a sandbox detonation of a file sample. You summarize what Elastic Defend observed when the sample ran in an instrumented VM.`;

/**
 * The evidence rule under test, verbatim from the detonate skill's system
 * instructions. An eval package cannot import plugin internals, so this is a
 * pinned copy; `evidence_rule_parity.test.ts` fails when the skill text and
 * this copy diverge. The mutation check drops exactly this section, which
 * reproduces the skill prompt as it was before the rule landed.
 */
export const EVIDENCE_RULE_SECTION = `## Evidence rule (mandatory wording constraints)

The word "malicious" may appear in a summary ONLY when the run produced hard
evidence: production endpoint alerts (Defend prevented something) or detection
rule hits. In every other case — zero alerts, diagnostic-only alerts, or a
failed run — the summary must use "suspicious" or say "no malicious behavior
was observed" and add that this is not proof the sample is benign. A summary
must NEVER conclude or imply the sample is "benign", "safe", or "clean"; quiet
runs are absence-of-evidence, not evidence of safety.`;

const renderAlertGroups = (
  groups: DetonateCorpusEntry['task']['production_endpoint_alert_groups']
) =>
  groups.length
    ? groups
        .map(
          (g) =>
            `- event_code: ${g.event_code}, alerts: ${g.alerts_count}${
              g.quarantined_count ? `, quarantined: ${g.quarantined_count}` : ''
            }`
        )
        .join('\n')
    : '- (none)';

const renderDetectionGroups = (
  groups: DetonateCorpusEntry['task']['production_detection_alert_groups']
) =>
  groups.length
    ? groups
        .map(
          (g) =>
            `- rule: ${g.kibana_alert_rule_name}, alerts: ${g.alerts_count}, severity: ${
              g.kibana_alert_rule_parameters_severity ?? 'n/a'
            }`
        )
        .join('\n')
    : '- (none)';

/** Renders one recorded task result the way get_detonation answers it. */
export const renderTaskForPrompt = (entry: DetonateCorpusEntry): string => {
  const t = entry.task;
  const failed = t.last_worker_status === 'failure';
  const complete =
    t.last_worker_name === 'detonate.workers.make_summary' && t.last_worker_status === 'success';
  const quiet =
    complete &&
    (t.production_endpoint_alerts_count ?? 0) === 0 &&
    (t.diagnostic_endpoint_alerts_count ?? 0) === 0 &&
    (t.production_detection_alerts_count ?? 0) === 0;

  return [
    `Detonation task ${t.id}`,
    `sample: ${t.sample_filename ?? t.sample_hash ?? 'unknown'}`,
    `last_worker_name: ${t.last_worker_name}`,
    `last_worker_status: ${t.last_worker_status}`,
    ...(t.last_worker_status_details
      ? [`last_worker_status_details: ${t.last_worker_status_details}`]
      : []),
    `complete: ${complete}`,
    `failed: ${failed}`,
    `quiet: ${quiet}`,
    '',
    "production endpoint alerts (what a customer's Defend would have raised):",
    renderAlertGroups(t.production_endpoint_alert_groups),
    "diagnostic endpoint alerts (Defend's diagnostic stream):",
    renderAlertGroups(t.diagnostic_endpoint_alert_groups),
    'detection rule alerts:',
    renderDetectionGroups(t.production_detection_alert_groups),
  ].join('\n');
};

/** The skill's reporting instructions, with or without the evidence rule. */
export const buildSummarySystemPrompt = ({
  includeEvidenceRule,
}: {
  includeEvidenceRule: boolean;
}): string =>
  [
    SUMMARY_SYSTEM_PROMPT_HEAD,
    '',
    '## Reporting rules',
    '',
    '- `complete: true, failed: false, quiet: true` — the run worked and produced no alerts. That is a **finding**, not a failure. Say the sample ran without raising anything, and name the possibilities honestly: the sample may be harmless, it may have detected the sandbox, or nothing detected it (a detection gap). Do not say the detonation "did not work".',
    '- `failed: true` — the detonation itself failed. There is no verdict about the sample.',
    '- Production endpoint alerts answer "would a customer\'s Defend have caught this". Diagnostic alerts answer "did Defend observe the behaviour at all". When diagnostic alerts exist but production alerts do not, say so explicitly.',
    '',
    ...(includeEvidenceRule ? [EVIDENCE_RULE_SECTION, ''] : []),
    'Now summarize the following detonation result for the analyst in 2-4 sentences, leading with the verdict and then the evidence behind it.',
  ].join('\n');

/** The task under test: produce the analyst-facing summary. */
export const runDetonateSummary = async ({
  inferenceClient,
  entry,
  log,
  dropEvidenceRule = false,
}: {
  inferenceClient: BoundInferenceClient;
  entry: DetonateCorpusEntry;
  log: ToolingLog;
  /** Mutation check: true reproduces the pre-rule prompt so the gate must go red. */
  dropEvidenceRule?: boolean;
}): Promise<DetonateSummaryOutput> => {
  log.debug(`Summarizing detonation ${entry.id} (label: ${entry.label})`);

  const { content } = await inferenceClient.chatComplete({
    system: buildSummarySystemPrompt({ includeEvidenceRule: !dropEvidenceRule }),
    messages: [{ role: MessageRole.User, content: renderTaskForPrompt(entry) }],
  });

  return { summary: content };
};
