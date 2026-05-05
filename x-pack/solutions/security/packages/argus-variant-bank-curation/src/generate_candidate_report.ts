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
  ClusteringMetrics,
  ReportConfig,
  BehavioralSignature,
  RepresentativeExample,
} from './types';
import { generateReportHTML } from './report_template';

/**
 * Load clusters from JSONL file (one cluster per line)
 */
export const loadClusters = (filePath: string): ProductionAlertCluster[] => {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ProductionAlertCluster);
};

/**
 * Compute clustering metrics from loaded clusters
 */
export const computeMetrics = (
  clusters: ProductionAlertCluster[],
  dateRange: { start: string; end: string }
): ClusteringMetrics => {
  const labelCounts = clusters.reduce(
    (acc, cluster) => {
      acc[cluster.label] = (acc[cluster.label] || 0) + 1;
      return acc;
    },
    { NEW: 0, DRIFT: 0, DUPLICATE: 0 } as Record<string, number>
  );

  const techniques = Array.from(new Set(clusters.map((c) => c.technique)));
  const avgSilhouette =
    clusters.reduce((sum, c) => sum + c.clustering_metrics.silhouette_score, 0) / clusters.length;

  return {
    total_clusters: clusters.length,
    clusters_by_label: labelCounts as { NEW: number; DRIFT: number; DUPLICATE: number },
    average_silhouette_score: avgSilhouette,
    techniques_covered: techniques,
    extraction_date_range: dateRange,
  };
};

/**
 * Generate candidate report HTML from clusters.jsonl
 */
export const generateCandidateReport = (
  clustersFilePath: string,
  outputFilePath: string,
  config: ReportConfig
): void => {
  console.log(`Loading clusters from ${clustersFilePath}...`);
  const clusters = loadClusters(clustersFilePath);

  console.log(`Loaded ${clusters.length} clusters`);

  // Extract date range from extraction metadata if available
  const metadataPath = path.join(
    path.dirname(clustersFilePath),
    'extraction_metadata.json'
  );
  let dateRange = { start: 'Unknown', end: 'Unknown' };
  if (fs.existsSync(metadataPath)) {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    dateRange = metadata.date_range || dateRange;
  }

  const metrics = computeMetrics(clusters, dateRange);

  console.log('Clustering Metrics:');
  console.log(`  Total Clusters: ${metrics.total_clusters}`);
  console.log(`  NEW: ${metrics.clusters_by_label.NEW}`);
  console.log(`  DRIFT: ${metrics.clusters_by_label.DRIFT}`);
  console.log(`  DUPLICATE: ${metrics.clusters_by_label.DUPLICATE}`);
  console.log(`  Avg Silhouette Score: ${metrics.average_silhouette_score.toFixed(3)}`);
  console.log(`  Techniques Covered: ${metrics.techniques_covered.length}`);

  // Filter to reviewable clusters (NEW and DRIFT only)
  const reviewableClusters = clusters.filter(
    (c) => c.label === 'NEW' || c.label === 'DRIFT'
  );

  console.log(
    `\nGenerating report for ${reviewableClusters.length} reviewable clusters...`
  );

  const html = generateReportHTML(reviewableClusters, metrics, config);

  fs.writeFileSync(outputFilePath, html, 'utf-8');
  console.log(`\nCandidate report written to ${outputFilePath}`);
  console.log(`\nReview interface URL: ${config.review_interface_url}`);
};

/**
 * CLI entry point
 */
export const main = (): void => {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node generate_candidate_report.js <clusters.jsonl> <output.html>');
    console.error('\nOptions (via environment variables):');
    console.error('  QUARTER: Quarterly refresh identifier (e.g., 2026-Q2)');
    console.error('  STAGING_BUCKET: S3 bucket path (e.g., s3://argus-variant-bank-staging)');
    console.error('  REVIEW_URL: Review interface base URL');
    console.error('  SSO_DOMAIN: SSO domain for analyst authentication');
    process.exit(1);
  }

  const [clustersFile, outputFile] = args;

  const config: ReportConfig = {
    quarter: process.env.QUARTER || 'YYYY-QN',
    staging_bucket_path: process.env.STAGING_BUCKET || 's3://argus-variant-bank-staging',
    review_interface_url:
      process.env.REVIEW_URL || 'https://argus-internal.elastic.dev/variant-review',
    analyst_sso_domain: process.env.SSO_DOMAIN || 'elastic.co',
  };

  try {
    generateCandidateReport(clustersFile, outputFile, config);
  } catch (error) {
    console.error('Error generating candidate report:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  main();
}
