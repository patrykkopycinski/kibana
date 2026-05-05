/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Behavioral feature vectors extracted from production alerts
 */
export interface BehavioralSignature {
  command_pattern?: string[];
  file_operations?: Array<{
    path: string;
    action: 'create' | 'modify' | 'delete' | 'read';
  }>;
  network_indicators?: Array<{
    port: number;
    protocol: 'tcp' | 'udp' | 'icmp';
    direction: 'inbound' | 'outbound';
  }>;
  registry_operations?: Array<{
    key: string;
    value_type?: string;
    operation: 'create' | 'modify' | 'delete' | 'read';
  }>;
}

/**
 * Representative alert sample from a cluster (anonymized ECS event)
 */
export interface RepresentativeExample {
  '@timestamp': string;
  'event.kind': string;
  'agent.type': string;
  'rule.mitre.technique': string[];
  process?: {
    command_line?: string;
    name?: string;
    parent?: {
      name?: string;
      command_line?: string;
    };
  };
  file?: {
    path?: string;
    extension?: string;
  };
  network?: {
    protocol?: string;
    transport?: string;
  };
  // Additional ECS fields as needed
  [key: string]: unknown;
}

/**
 * Cluster produced by HDBSCAN analysis per MITRE technique
 */
export interface ProductionAlertCluster {
  cluster_id: string;
  technique: string;
  size: number;
  behavioral_signature: BehavioralSignature;
  representative_examples: RepresentativeExample[];
  similarity_to_existing: number;
  label: 'NEW' | 'DRIFT' | 'DUPLICATE';
  clustering_metrics: {
    silhouette_score: number;
    intra_cluster_distance: number;
  };
}

/**
 * Quality annotation applied by Security Research Analyst
 */
export type QualityLabel = 'APPROVED' | 'REJECTED' | 'NEEDS_REFINEMENT';

/**
 * Analyst review decision for a cluster candidate
 */
export interface AnalystReview {
  cluster_id: string;
  quality_label: QualityLabel;
  analyst_email: string;
  reviewed_at: string;
  rationale: string;
  notes?: string;
}

/**
 * Approved variant ready for corpus integration
 */
export interface ApprovedVariant {
  variant_id: string;
  technique: string;
  variant_type: 'evasion_permutation';
  behavioral_signature: BehavioralSignature;
  representative_samples: RepresentativeExample[];
  provenance: {
    source: string;
    cluster_id: string;
    analyst_approved_by: string;
    approved_date: string;
    approval_rationale: string;
  };
  metadata: {
    created_at: string;
    quarterly_refresh: string;
  };
}

/**
 * Audit log entry for analyst review session
 */
export interface ReviewAuditEntry {
  cluster_id: string;
  analyst_email: string;
  action: 'approve' | 'reject' | 'needs_refinement' | 'merge' | 'split';
  timestamp: string;
  rationale: string;
  metadata?: Record<string, unknown>;
}

/**
 * Clustering metadata and quality metrics
 */
export interface ClusteringMetrics {
  total_clusters: number;
  clusters_by_label: {
    NEW: number;
    DRIFT: number;
    DUPLICATE: number;
  };
  average_silhouette_score: number;
  techniques_covered: string[];
  extraction_date_range: {
    start: string;
    end: string;
  };
}

/**
 * Configuration for candidate report generation
 */
export interface ReportConfig {
  quarter: string;
  staging_bucket_path: string;
  review_interface_url: string;
  analyst_sso_domain: string;
}
