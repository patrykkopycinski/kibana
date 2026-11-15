/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import { EuiSpacer, EuiText } from '@elastic/eui';
import {
  deriveDetonateVerdict,
  detonationConfidence,
  totalDetonationAlerts,
} from '../../../../../common/detonate_prototype';
import type { DetonateTask } from '../../../../../common/detonate_prototype';
import * as i18n from '../../../../detonate_prototype/translations';
import { DocumentSummarySection } from '../../../document/main/components/document_summary_section';
import { DETONATION_AI_SUMMARY_FALLBACK_TEST_ID, DETONATION_AI_SUMMARY_TEST_ID } from '../test_ids';
import { CONFIDENCE_LABEL, VERDICT_LABEL } from '../utils/detonation_labels';

interface AiSummarySectionProps {
  task: DetonateTask;
}

/** The verdict, confidence and evidence as one sentence; needs no model call. */
const fallbackLine = (task: DetonateTask): string => {
  const { verdict, evidence } = deriveDetonateVerdict(task);
  if (!verdict) return i18n.OVERVIEW_AI_SUMMARY_NO_VERDICT;
  return i18n.OVERVIEW_AI_SUMMARY_LINE({
    verdict: VERDICT_LABEL[verdict],
    confidence: CONFIDENCE_LABEL[detonationConfidence(verdict)],
    evidence,
  });
};

/**
 * Reuses the document flyout's AI summary section with the task id as the
 * document id. Known differences from a detonation-specific summary:
 * - it hard-codes the assistant context category to `alert` ("Alert summary");
 * - the summary is not saved (`persist={false}`): a run is not an alert, so
 *   no summary document is written for its id and it is lost on close;
 * - it keeps its expanded state under the document flyout's storage key, in a
 *   section called `aisummary`, not under the detonation flyout's key;
 * - it renders its own "AI summary" section, so it gets no wrapper section here.
 * It does not generate on open: the analyst asks for the summary.
 * The Family field is left out because the run contract has no field for it.
 * The line below is always shown, so the section is useful with no connector.
 */
export const AiSummarySection = ({ task }: AiSummarySectionProps) => {
  const getPromptContext = useCallback(async (): Promise<Record<string, string[]>> => {
    const { verdict, evidence } = deriveDetonateVerdict(task);
    const context: Record<string, string[]> = {
      task_id: [task.id],
      evidence: [evidence],
      production_endpoint_alerts: [String(task.production_endpoint_alerts_count ?? 0)],
      production_detection_alerts: [String(task.production_detection_alerts_count ?? 0)],
      diagnostic_endpoint_alerts: [String(task.diagnostic_endpoint_alerts_count ?? 0)],
      total_alerts: [String(totalDetonationAlerts(task))],
    };
    if (verdict) context.verdict = [verdict];
    if (task.sample_hash) context['file.hash.sha256'] = [task.sample_hash];
    if (task.sample_filename) context['file.name'] = [task.sample_filename];
    if (task.vm_os_family) context['detonate.vm.os_family'] = [task.vm_os_family];
    return context;
  }, [task]);

  return (
    <>
      <DocumentSummarySection
        key={task.id}
        documentId={task.id}
        persist={false}
        getPromptContext={getPromptContext}
        data-test-subj={DETONATION_AI_SUMMARY_TEST_ID}
      />
      <EuiSpacer size="s" />
      <EuiText size="s" data-test-subj={DETONATION_AI_SUMMARY_FALLBACK_TEST_ID}>
        {fallbackLine(task)}
      </EuiText>
    </>
  );
};
