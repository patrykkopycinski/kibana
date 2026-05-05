# ARGUS Variant Bank Curation

Tools for curating production-grounded ARGUS variant bank from analytics cluster alert clustering.

## Overview

This package provides analyst curation tools for Phase 3 of the quarterly ARGUS variant bank refresh schedule. Security Research Analysts use these tools to review production alert cluster candidates and select representative clusters per MITRE technique for variant bank addition.

## Components

### 1. Candidate Report Generator (`generate_candidate_report.ts`)

Generates an interactive HTML interface from clustering analysis results.

**Input:**
- `clusters.jsonl`: JSONL file with one cluster per line (output from Phase 2 clustering analysis)
- `extraction_metadata.json`: Optional metadata with date range and sampling statistics

**Output:**
- `candidate_report.html`: Interactive HTML interface for analyst review

**Usage:**

```bash
# Set environment variables
export QUARTER=2026-Q2
export STAGING_BUCKET=s3://argus-variant-bank-staging
export REVIEW_URL=https://argus-internal.elastic.dev/variant-review
export SSO_DOMAIN=elastic.co

# Generate report
node scripts/generate_candidate_report.js \
  /path/to/clusters.jsonl \
  /path/to/candidate_report.html
```

### 2. Analyst Review Interface (HTML/JavaScript)

Interactive web interface for reviewing cluster candidates.

**Features:**
- Filter by cluster label (NEW/DRIFT) and MITRE technique
- View behavioral signatures and representative samples
- Label clusters as APPROVED, REJECTED, or NEEDS_REFINEMENT
- Provide rationale for decisions
- Auto-save reviews to localStorage
- Export draft reviews or submit final audit log

**Access:**
- SSO authentication required (configured via `SSO_DOMAIN`)
- Served at `REVIEW_URL/quarter=YYYY-QN/`

**Workflow:**
1. Analyst opens `candidate_report.html` in browser
2. Reviews each cluster's behavioral signature and representative examples
3. Selects quality label (APPROVED/REJECTED/NEEDS_REFINEMENT)
4. Provides rationale explaining decision
5. Clicks "Submit Reviews" to download `review_audit_YYYY-QN.jsonl`
6. Uploads audit log to staging bucket: `s3://argus-variant-bank-staging/quarter=YYYY-QN/review_audit.jsonl`

### 3. Review Processor (`process_analyst_reviews.ts`)

Converts analyst review decisions into approved variant documents ready for corpus integration.

**Input:**
- `clusters.jsonl`: Original clustering analysis results
- `review_audit.jsonl`: Analyst review decisions (from HTML interface)

**Output:**
- `approved_variants.jsonl`: Variant documents for clusters labeled APPROVED
- `approved_variants_summary.json`: Summary statistics and quality gate validation

**Usage:**

```bash
# Set quarter
export QUARTER=2026-Q2

# Process reviews
node scripts/process_analyst_reviews.js \
  /path/to/clusters.jsonl \
  /path/to/review_audit.jsonl \
  /path/to/approved_variants.jsonl
```

**Quality Gates:**
- APPROVED rate >= 30% of NEW clusters (validates discovery of quality patterns)
- REJECTED rate <= 50% (validates clustering precision)
- All NEW/DRIFT clusters reviewed (zero unreviewed clusters)

## Data Schema

### ProductionAlertCluster

```typescript
{
  cluster_id: string;
  technique: string; // MITRE ATT&CK technique ID (e.g., "T1059.001")
  size: number; // Number of alerts in cluster
  behavioral_signature: {
    command_pattern?: string[];
    file_operations?: Array<{ path: string; action: string }>;
    network_indicators?: Array<{ port: number; protocol: string; direction: string }>;
    registry_operations?: Array<{ key: string; operation: string }>;
  };
  representative_examples: Array<{ /* anonymized ECS event */ }>;
  similarity_to_existing: number; // 0.0-1.0 Jaccard similarity to existing variants
  label: 'NEW' | 'DRIFT' | 'DUPLICATE';
  clustering_metrics: {
    silhouette_score: number;
    intra_cluster_distance: number;
  };
}
```

### ReviewAuditEntry

```typescript
{
  cluster_id: string;
  analyst_email: string;
  action: 'approve' | 'reject' | 'needs_refinement';
  timestamp: string; // ISO 8601
  rationale: string; // Analyst's explanation
}
```

### ApprovedVariant

```typescript
{
  variant_id: string; // Auto-generated: "T1059-001-drift-2026-q2-cluster-42"
  technique: string;
  variant_type: 'evasion_permutation';
  behavioral_signature: { /* same as cluster */ };
  representative_samples: Array<{ /* 5 selected ECS events */ }>;
  provenance: {
    source: string; // "analytics_cluster_2026-q2"
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
```

## End-to-End Example

### Phase 2 Output (Clustering Analysis)

```bash
# clusters.jsonl (produced by soc-argus-cluster-production-alerts workflow)
{"cluster_id":"cluster-42","technique":"T1059.001","size":234,"behavioral_signature":{...},...}
{"cluster_id":"cluster-43","technique":"T1059.001","size":189,"behavioral_signature":{...},...}
...
```

### Generate Review Interface

```bash
export QUARTER=2026-Q2
node scripts/generate_candidate_report.js \
  s3://argus-variant-bank-staging/quarter=2026-Q2/clusters.jsonl \
  s3://argus-variant-bank-staging/quarter=2026-Q2/candidate_report.html
```

### Analyst Review Session

1. Analyst opens `https://argus-internal.elastic.dev/variant-review/2026-Q2/`
2. Reviews 120 NEW clusters and 45 DRIFT clusters
3. Labels 52 as APPROVED, 98 as REJECTED, 15 as NEEDS_REFINEMENT
4. Submits reviews → downloads `review_audit_2026-Q2.jsonl`
5. Uploads to `s3://argus-variant-bank-staging/quarter=2026-Q2/review_audit.jsonl`

### Process Reviews

```bash
export QUARTER=2026-Q2
node scripts/process_analyst_reviews.js \
  s3://argus-variant-bank-staging/quarter=2026-Q2/clusters.jsonl \
  s3://argus-variant-bank-staging/quarter=2026-Q2/review_audit.jsonl \
  s3://argus-variant-bank-staging/quarter=2026-Q2/approved_variants.jsonl

# Output:
# ✓ 52 approved variants written to approved_variants.jsonl
# ✓ Quality gates passed
# ⚠ 15 clusters marked NEEDS_REFINEMENT (require follow-up)
```

### Phase 4 Input (Corpus Integration)

The `approved_variants.jsonl` file is consumed by the `soc-argus-integrate-variants` workflow to add variants to the production corpus.

## Development

### Build

```bash
cd x-pack/solutions/security/packages/argus-variant-bank-curation
yarn kbn bootstrap
```

### Type Check

```bash
node scripts/type_check --project x-pack/solutions/security/packages/argus-variant-bank-curation/tsconfig.json
```

### Lint

```bash
node scripts/eslint --fix x-pack/solutions/security/packages/argus-variant-bank-curation/src/**/*.ts
```

## References

- **Quarterly Refresh Schedule:** `openspec/changes/argus-analytics-data-strategy/specs/variant-bank-refresh/spec.md`
- **ARGUS Analytics Data Strategy Proposal:** `openspec/changes/argus-analytics-data-strategy/proposal.md`
- **ARGUS Analytics Data Strategy Design:** `openspec/changes/argus-analytics-data-strategy/design.md`

## Owner

@elastic/security-detection-rule-management
