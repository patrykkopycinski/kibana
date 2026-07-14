/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Spike-canonical mirror of 9.5 Attack Discovery platform shapes.
 * Source of truth: `@kbn/elastic-assistant-common` OpenAPI schemas
 * (`AttackDiscovery`, `AttackDiscoveryApiAlert`, `AttackDiscoveryGeneration`).
 *
 * Inlined here so the daybreak plugin stays self-contained for #17942 ratification.
 */

/** Generation output (camelCase) — `AttackDiscovery` in common_attributes.gen.ts */
export interface AttackDiscoveryGenerationOutput {
  id?: string;
  title: string;
  summaryMarkdown: string;
  detailsMarkdown: string;
  entitySummaryMarkdown?: string;
  mitreAttackTactics?: string[];
  alertIds: string[];
  timestamp?: string;
}

/** Persisted public API alert (snake_case) — `AttackDiscoveryApiAlert` */
export interface AttackDiscoveryApiAlertOutput {
  id: string;
  title: string;
  generation_uuid: string;
  connector_id: string;
  connector_name: string;
  alert_ids: string[];
  summary_markdown: string;
  details_markdown: string;
  entity_summary_markdown?: string;
  mitre_attack_tactics?: string[];
  alert_workflow_status?: string;
  risk_score?: number;
  timestamp: string;
  index?: string;
  alert_rule_uuid?: string;
  assignees?: string[];
  tags?: string[];
}

/** Generation run metadata — subset of `AttackDiscoveryGeneration` */
export interface AttackDiscoveryGenerationContext {
  execution_uuid: string;
  connector_id: string;
  connector_name?: string;
  status?: string;
  alerts_context_count?: number;
  persisted_count?: number;
}

/** Continuation handoff context (daybreak-specific until platform APIs land). */
export interface AttackDiscoveryContinuationContext {
  investigationId?: string;
  caseId?: string;
  priorContinuationDecisionIds?: string[];
  evidenceDeltaMarkdown?: string;
}

/** Legacy spike stub — kept for synthetic dataset scenarios. */
export interface AttackDiscoveryLegacyStub {
  id: string;
  title: string;
  description?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  confidence?: number;
  tactics?: string[];
  relatedAlertIds?: string[];
  triageStatus?: 'open' | 'acknowledged' | 'closed';
  monitorOnly?: boolean;
  duplicateOf?: string;
  missingEvidence?: boolean;
  contradicts?: string[];
}

export type AttackDiscoveryInput =
  | AttackDiscoveryLegacyStub
  | AttackDiscoveryGenerationOutput
  | AttackDiscoveryApiAlertOutput;

export interface NormalizedAttackDiscovery {
  discoveryId: string;
  title: string;
  summaryMarkdown: string;
  detailsMarkdown: string;
  entitySummaryMarkdown?: string;
  mitreAttackTactics: string[];
  alertIds: string[];
  timestamp?: string;
  generationUuid?: string;
  connectorId?: string;
  connectorName?: string;
  alertWorkflowStatus?: string;
  riskScore?: number;
  sourceIndex?: string;
  investigationId?: string;
  caseId?: string;
  priorContinuationDecisionIds: string[];
  evidenceDeltaMarkdown?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  confidence?: number;
  monitorOnly?: boolean;
  duplicateOf?: string;
  missingEvidence?: boolean;
  contradicts?: string[];
  triageStatus?: 'open' | 'acknowledged' | 'closed';
  inputKind: 'legacy-stub' | 'generation-output' | 'api-alert';
}

const isApiAlertOutput = (input: AttackDiscoveryInput): input is AttackDiscoveryApiAlertOutput =>
  'summary_markdown' in input && 'generation_uuid' in input;

const isGenerationOutput = (input: AttackDiscoveryInput): input is AttackDiscoveryGenerationOutput =>
  'summaryMarkdown' in input && 'alertIds' in input;

export const isLegacyAttackDiscoveryStub = (
  input: AttackDiscoveryInput
): input is AttackDiscoveryLegacyStub =>
  !isApiAlertOutput(input) && !isGenerationOutput(input);

const workflowStatusToTriage = (
  status: string | undefined
): NormalizedAttackDiscovery['triageStatus'] => {
  if (status === 'acknowledged' || status === 'closed' || status === 'open') {
    return status;
  }
  return 'open';
};

const riskScoreToSeverity = (
  riskScore: number | undefined
): NormalizedAttackDiscovery['severity'] => {
  if (riskScore === undefined) return 'medium';
  if (riskScore >= 90) return 'critical';
  if (riskScore >= 70) return 'high';
  if (riskScore >= 40) return 'medium';
  return 'low';
};

export interface NormalizeAttackDiscoveryParams {
  input: AttackDiscoveryInput;
  generation?: AttackDiscoveryGenerationContext;
  continuation?: AttackDiscoveryContinuationContext;
}

/** Normalize legacy stub, generation output, or persisted API alert into one shape. */
export const normalizeAttackDiscoveryInput = (
  params: NormalizeAttackDiscoveryParams
): NormalizedAttackDiscovery => {
  const { input, generation, continuation } = params;

  if (isApiAlertOutput(input)) {
    return {
      discoveryId: input.id,
      title: input.title,
      summaryMarkdown: input.summary_markdown,
      detailsMarkdown: input.details_markdown,
      entitySummaryMarkdown: input.entity_summary_markdown,
      mitreAttackTactics: input.mitre_attack_tactics ?? [],
      alertIds: input.alert_ids,
      timestamp: input.timestamp,
      generationUuid: input.generation_uuid,
      connectorId: input.connector_id,
      connectorName: input.connector_name,
      alertWorkflowStatus: input.alert_workflow_status,
      riskScore: input.risk_score,
      sourceIndex: input.index,
      investigationId: continuation?.investigationId,
      caseId: continuation?.caseId,
      priorContinuationDecisionIds: continuation?.priorContinuationDecisionIds ?? [],
      evidenceDeltaMarkdown: continuation?.evidenceDeltaMarkdown,
      severity: riskScoreToSeverity(input.risk_score),
      confidence: input.risk_score !== undefined ? input.risk_score / 100 : 0.85,
      triageStatus: workflowStatusToTriage(input.alert_workflow_status),
      inputKind: 'api-alert',
    };
  }

  if (isGenerationOutput(input)) {
    return {
      discoveryId: input.id ?? `ad-gen-${input.title.toLowerCase().replace(/\s+/g, '-')}`,
      title: input.title,
      summaryMarkdown: input.summaryMarkdown,
      detailsMarkdown: input.detailsMarkdown,
      entitySummaryMarkdown: input.entitySummaryMarkdown,
      mitreAttackTactics: input.mitreAttackTactics ?? [],
      alertIds: input.alertIds,
      timestamp: input.timestamp,
      generationUuid: generation?.execution_uuid,
      connectorId: generation?.connector_id,
      connectorName: generation?.connector_name,
      investigationId: continuation?.investigationId,
      caseId: continuation?.caseId,
      priorContinuationDecisionIds: continuation?.priorContinuationDecisionIds ?? [],
      evidenceDeltaMarkdown: continuation?.evidenceDeltaMarkdown,
      severity: 'high',
      confidence: 0.85,
      triageStatus: 'open',
      inputKind: 'generation-output',
    };
  }

  const stub = input;
  return {
    discoveryId: stub.id,
    title: stub.title,
    summaryMarkdown: stub.description ?? stub.title,
    detailsMarkdown: stub.description ?? '',
    mitreAttackTactics: stub.tactics ?? [],
    alertIds: stub.relatedAlertIds ?? [],
    severity: stub.severity,
    confidence: stub.confidence,
    monitorOnly: stub.monitorOnly,
    duplicateOf: stub.duplicateOf,
    missingEvidence: stub.missingEvidence,
    contradicts: stub.contradicts,
    triageStatus: stub.triageStatus,
    investigationId: continuation?.investigationId,
    caseId: continuation?.caseId,
    priorContinuationDecisionIds: continuation?.priorContinuationDecisionIds ?? [],
    evidenceDeltaMarkdown: continuation?.evidenceDeltaMarkdown,
    inputKind: 'legacy-stub',
  };
};
