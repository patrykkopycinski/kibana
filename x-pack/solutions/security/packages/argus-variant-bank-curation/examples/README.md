# Example Data

This directory contains sample data for testing the ARGUS variant bank curation tools.

## Files

- `sample_cluster.jsonl`: Example clustering analysis output with 3 clusters (NEW, DRIFT, DUPLICATE)
- `extraction_metadata.json`: Example metadata from Phase 1 data extraction
- `sample_review_audit.jsonl`: Example analyst review decisions
- `expected_approved_variants.jsonl`: Expected output from processing the sample reviews

## Testing the Workflow

### 1. Generate Candidate Report

```bash
export QUARTER=2026-Q2
export STAGING_BUCKET=s3://argus-variant-bank-staging
export REVIEW_URL=https://argus-internal.elastic.dev/variant-review
export SSO_DOMAIN=elastic.co

node scripts/generate_candidate_report.js \
  examples/sample_cluster.jsonl \
  examples/candidate_report.html
```

Open `examples/candidate_report.html` in a browser to review the interface.

### 2. Simulate Analyst Review

Create a review audit file manually or use the web interface to generate one:

```bash
cat > examples/sample_review_audit.jsonl << 'EOF'
{"cluster_id":"cluster-42","analyst_email":"analyst@elastic.co","action":"approve","timestamp":"2026-05-15T10:30:00Z","rationale":"Novel PowerShell obfuscation via base64-encoded command with temp file staging. Distinct from existing T1059.001 variants."}
{"cluster_id":"cluster-43","analyst_email":"analyst@elastic.co","action":"reject","timestamp":"2026-05-15T10:35:00Z","rationale":"Too similar to existing certutil decode patterns. Not sufficiently distinct to warrant new variant."}
EOF
```

### 3. Process Reviews

```bash
export QUARTER=2026-Q2

node scripts/process_analyst_reviews.js \
  examples/sample_cluster.jsonl \
  examples/sample_review_audit.jsonl \
  examples/approved_variants.jsonl
```

Check the output:
- `examples/approved_variants.jsonl`: Should contain 1 approved variant (cluster-42)
- `examples/approved_variants_summary.json`: Should show approval/rejection statistics
