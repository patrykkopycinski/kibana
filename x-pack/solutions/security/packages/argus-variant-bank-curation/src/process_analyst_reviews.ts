/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  ProductionAlertCluster,
  AnalystReview,
  ApprovedVariant,
  ReviewAuditEntry,
  QualityLabel,
  RepresentativeExample,
} from './types';

/**
 * Load review audit entries from JSONL file
 */
export const loadReviewAudit = (filePath: string): ReviewAuditEntry[] => {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ReviewAuditEntry);
};

/**
 * Load clusters from JSONL file
 */
export const loadClusters = (filePath: string): ProductionAlertCluster[] => {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ProductionAlertCluster);
};

/**
 * Convert review audit entries to analyst review format
 */
export const convertToAnalystReviews = (
  auditEntries: ReviewAuditEntry[]
): AnalystReview[] => {
  return auditEntries.map((entry) => {
    let qualityLabel: QualityLabel;
    switch (entry.action) {
      case 'approve':
        qualityLabel = 'APPROVED';
        break;
      case 'reject':
        qualityLabel = 'REJECTED';
        break;
      case 'needs_refinement':
        qualityLabel = 'NEEDS_REFINEMENT';
        break;
      default:
        throw new Error(`Unknown action: ${entry.action}`);
    }

    return {
      cluster_id: entry.cluster_id,
      quality_label: qualityLabel,
      analyst_email: entry.analyst_email,
      reviewed_at: entry.timestamp,
      rationale: entry.rationale,
    };
  });
};

/**
 * Select representative samples from cluster using diversity sampling
 */
export const selectRepresentativeSamples = (
  cluster: ProductionAlertCluster,
  sampleCount: number = 5
): RepresentativeExample[] => {
  const examples = cluster.representative_examples;
  if (examples.length <= sampleCount) {
    return examples;
  }

  // Simple diversity sampling: space samples evenly across the cluster
  const step = examples.length / sampleCount;
  const selected: RepresentativeExample[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const index = Math.floor(i * step);
    selected.push(examples[index]);
  }
  return selected;
};

/**
 * Generate variant ID from cluster and quarter
 */
export const generateVariantId = (
  cluster: ProductionAlertCluster,
  quarter: string
): string => {
  const techniqueSlug = cluster.technique.replace(/\./g, '-');
  const labelSlug = cluster.label.toLowerCase();
  const clusterSlug = cluster.cluster_id.replace(/[^a-z0-9]/gi, '-');
  return `${techniqueSlug}-${labelSlug}-${quarter.toLowerCase()}-${clusterSlug}`;
};

/**
 * Convert approved cluster to variant document
 */
export const createApprovedVariant = (
  cluster: ProductionAlertCluster,
  review: AnalystReview,
  quarter: string
): ApprovedVariant => {
  const variantId = generateVariantId(cluster, quarter);
  const representativeSamples = selectRepresentativeSamples(cluster, 5);

  return {
    variant_id: variantId,
    technique: cluster.technique,
    variant_type: 'evasion_permutation',
    behavioral_signature: cluster.behavioral_signature,
    representative_samples: representativeSamples,
    provenance: {
      source: `analytics_cluster_${quarter.toLowerCase()}`,
      cluster_id: cluster.cluster_id,
      analyst_approved_by: review.analyst_email,
      approved_date: review.reviewed_at,
      approval_rationale: review.rationale,
    },
    metadata: {
      created_at: new Date().toISOString(),
      quarterly_refresh: quarter,
    },
  };
};

/**
 * Validate quality gates for approved variants
 */
export const validateQualityGates = (
  reviews: AnalystReview[],
  totalNewClusters: number
): void => {
  const approvedCount = reviews.filter((r) => r.quality_label === 'APPROVED').length;
  const rejectedCount = reviews.filter((r) => r.quality_label === 'REJECTED').length;
  const needsRefinementCount = reviews.filter(
    (r) => r.quality_label === 'NEEDS_REFINEMENT'
  ).length;

  console.log('\nQuality Gate Validation:');
  console.log(`  Total Reviews: ${reviews.length}`);
  console.log(`  APPROVED: ${approvedCount}`);
  console.log(`  REJECTED: ${rejectedCount}`);
  console.log(`  NEEDS_REFINEMENT: ${needsRefinementCount}`);

  // Quality gate: APPROVED rate >= 30% of NEW clusters
  const approvalRate = approvedCount / totalNewClusters;
  if (approvalRate < 0.3) {
    console.warn(
      `⚠ WARNING: Approval rate (${(approvalRate * 100).toFixed(1)}%) is below 30% target`
    );
  } else {
    console.log(`✓ Approval rate: ${(approvalRate * 100).toFixed(1)}%`);
  }

  // Quality gate: REJECTED rate <= 50%
  const rejectionRate = rejectedCount / reviews.length;
  if (rejectionRate > 0.5) {
    console.warn(
      `⚠ WARNING: Rejection rate (${(rejectionRate * 100).toFixed(1)}%) exceeds 50% threshold`
    );
  } else {
    console.log(`✓ Rejection rate: ${(rejectionRate * 100).toFixed(1)}%`);
  }

  // Quality gate: All NEW clusters reviewed
  if (reviews.length < totalNewClusters) {
    throw new Error(
      `CRITICAL: Only ${reviews.length} of ${totalNewClusters} NEW/DRIFT clusters reviewed. All must be reviewed.`
    );
  }

  console.log('✓ All quality gates passed\n');
};

/**
 * Generate approved variants from analyst reviews
 */
export const processAnalystReviews = (
  clustersFilePath: string,
  reviewAuditFilePath: string,
  outputFilePath: string,
  quarter: string
): void => {
  console.log(`Loading clusters from ${clustersFilePath}...`);
  const allClusters = loadClusters(clustersFilePath);

  console.log(`Loading review audit from ${reviewAuditFilePath}...`);
  const auditEntries = loadReviewAudit(reviewAuditFilePath);
  const reviews = convertToAnalystReviews(auditEntries);

  console.log(`\nProcessing ${reviews.length} analyst reviews...`);

  // Create lookup maps
  const clusterMap = new Map(allClusters.map((c) => [c.cluster_id, c]));
  const reviewMap = new Map(reviews.map((r) => [r.cluster_id, r]));

  // Filter to NEW/DRIFT clusters only
  const reviewableClusters = allClusters.filter(
    (c) => c.label === 'NEW' || c.label === 'DRIFT'
  );

  // Validate quality gates
  validateQualityGates(reviews, reviewableClusters.length);

  // Generate approved variants
  const approvedVariants: ApprovedVariant[] = [];
  const needsRefinementClusters: string[] = [];

  reviews.forEach((review) => {
    const cluster = clusterMap.get(review.cluster_id);
    if (!cluster) {
      console.warn(`⚠ WARNING: Cluster ${review.cluster_id} not found in clusters.jsonl`);
      return;
    }

    if (review.quality_label === 'APPROVED') {
      const variant = createApprovedVariant(cluster, review, quarter);
      approvedVariants.push(variant);
    } else if (review.quality_label === 'NEEDS_REFINEMENT') {
      needsRefinementClusters.push(review.cluster_id);
    }
  });

  console.log(`\nGenerated ${approvedVariants.length} approved variants`);

  if (needsRefinementClusters.length > 0) {
    console.log(
      `\n⚠ ${needsRefinementClusters.length} clusters marked NEEDS_REFINEMENT:`
    );
    needsRefinementClusters.forEach((id) => console.log(`  - ${id}`));
    console.log(
      '\nThese clusters require follow-up action (behavioral signature adjustment or re-clustering).'
    );
  }

  // Write approved variants to JSONL
  const jsonl = approvedVariants.map((v) => JSON.stringify(v)).join('\n');
  fs.writeFileSync(outputFilePath, jsonl, 'utf-8');

  console.log(`\n✓ Approved variants written to ${outputFilePath}`);

  // Generate summary report
  const summaryPath = outputFilePath.replace('.jsonl', '_summary.json');
  const summary = {
    quarter,
    total_reviews: reviews.length,
    approved_count: approvedVariants.length,
    rejected_count: reviews.filter((r) => r.quality_label === 'REJECTED').length,
    needs_refinement_count: needsRefinementClusters.length,
    variants_by_technique: approvedVariants.reduce((acc, v) => {
      acc[v.technique] = (acc[v.technique] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    generated_at: new Date().toISOString(),
  };

  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`✓ Summary report written to ${summaryPath}`);
};

/**
 * CLI entry point
 */
export const main = (): void => {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.error(
      'Usage: node process_analyst_reviews.js <clusters.jsonl> <review_audit.jsonl> <approved_variants.jsonl>'
    );
    console.error('\nOptions (via environment variables):');
    console.error('  QUARTER: Quarterly refresh identifier (e.g., 2026-Q2)');
    process.exit(1);
  }

  const [clustersFile, reviewAuditFile, outputFile] = args;
  const quarter = process.env.QUARTER || 'YYYY-QN';

  try {
    processAnalystReviews(clustersFile, reviewAuditFile, outputFile, quarter);
  } catch (error) {
    console.error('Error processing analyst reviews:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  main();
}
