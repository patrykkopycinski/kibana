/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export type {
  BehavioralSignature,
  RepresentativeExample,
  ProductionAlertCluster,
  QualityLabel,
  AnalystReview,
  ApprovedVariant,
  ReviewAuditEntry,
  ClusteringMetrics,
  ReportConfig,
} from './types';

export { generateCandidateReport, loadClusters, computeMetrics } from './generate_candidate_report';
export {
  processAnalystReviews,
  loadReviewAudit,
  convertToAnalystReviews,
  selectRepresentativeSamples,
  generateVariantId,
  createApprovedVariant,
  validateQualityGates,
} from './process_analyst_reviews';
export { generateReportHTML } from './report_template';
