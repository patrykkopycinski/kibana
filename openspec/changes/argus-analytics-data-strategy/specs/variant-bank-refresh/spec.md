# Quarterly Variant Bank Refresh Schedule

## Overview

This document defines the operational schedule for refreshing the ARGUS variant bank with production-grounded evasion permutations derived from analytics cluster alert clustering. The variant bank expansion process runs quarterly to incorporate newly observed attack techniques, evasion patterns, and behavioral variations discovered in real customer endpoint telemetry.

## Goals

- Maintain a production-grounded variant bank that reflects empirically observed attack patterns
- Establish predictable quarterly cadence for variant bank updates aligned with detection content releases
- Define clear responsibilities for data extraction, analyst review, and corpus integration
- Ensure PII compliance and anonymization at every stage of the pipeline

## Schedule Overview

**Quarterly Cadence:** Aligned with Elastic Security detection content release cycle (typically Week 1 of Q1/Q2/Q3/Q4)

| Phase | Duration | Owner | Deliverable |
|-------|----------|-------|-------------|
| **Week -8: Data Extraction** | 3 days | Analytics Platform Team | Anonymized production alert dataset exported from analytics cluster |
| **Week -7: Clustering Analysis** | 5 days | SOC Automation Team | Variant candidate clusters grouped by MITRE technique |
| **Week -6 to -4: Analyst Review** | 2 weeks | Security Research Analysts | Reviewed and approved variant candidates with quality labels |
| **Week -3: Corpus Integration** | 3 days | SOC Automation Team | Variants merged into `.soc-eval-corpus-production-baseline` |
| **Week -2: Validation** | 5 days | Detection Engineering | Eval runs against updated corpus; regression check |
| **Week -1: Deployment** | 2 days | SOC Automation Team | Updated corpus promoted to production ARGUS cluster |

**Next Scheduled Refresh Dates (2026):**
- Q2: June 2-30, 2026 (data extraction starts May 25)
- Q3: September 1-29, 2026 (data extraction starts August 25)
- Q4: December 1-29, 2026 (data extraction starts November 24)

## Phase 1: Data Extraction (Week -8)

**Trigger:** Quarterly refresh kickoff (automated calendar event)

**Workflow:** `soc-argus-analytics-sync-quarterly`

**Input:**
- Analytics cluster endpoint: `https://analytics.elastic.internal:9200`
- Date range: Previous 90 days of production endpoint alerts
- Indices: `alert_telemetry_elastic*`, `behavioral_telemetry_endpoint*`
- Sampling strategy: Stratified by `rule.mitre.technique`, max 10K events per technique

**Process:**
1. Authenticate to analytics cluster via Kibana proxy with read-only service account
2. Query for endpoint alerts with `event.kind: alert` and `agent.type: endpoint`
3. Apply stratified sampling to cap technique-specific samples at 10K events
4. Execute PII scrubbing protocol:
   - Strip `customer_account_name`, `cloud_org_email_domain`, `cluster_name`, `cluster_uuid`
   - Hash `agent.id` with salt from `~/.argus/secrets/agent_id_salt`
   - Remove IP addresses from `host.ip`, `source.ip`, `destination.ip`
   - Strip `user.email`, `user.full_name`, `user.domain`
   - Redact file paths containing PII patterns (`/Users/*/`, `/home/*/`)
5. Write anonymized events to staging bucket: `s3://argus-variant-bank-staging/quarter=YYYY-QN/raw_alerts.ndjson`
6. Generate extraction metadata report: event counts by technique, date range coverage, sampling statistics

**Output:**
- `s3://argus-variant-bank-staging/quarter=YYYY-QN/raw_alerts.ndjson` (anonymized NDJSON)
- `s3://argus-variant-bank-staging/quarter=YYYY-QN/extraction_metadata.json`

**Validation:**
- Zero PII leakage (automated scan with `argus-pii-detector`)
- Event count >= 100K (validates sufficient sampling)
- Technique coverage >= 80% of MITRE ATT&CK matrix (validates stratification)

**Responsibilities:**
- **Analytics Platform Team:** Execute workflow, validate PII scrubbing, confirm S3 upload
- **On-call Engineer:** Monitor workflow execution, escalate failures

## Phase 2: Clustering Analysis (Week -7)

**Trigger:** Successful completion of Phase 1 data extraction

**Workflow:** `soc-argus-cluster-production-alerts`

**Input:**
- `s3://argus-variant-bank-staging/quarter=YYYY-QN/raw_alerts.ndjson`
- Clustering config: `config/production_clustering_config.yaml`
- Reference variant bank: `.soc-eval-corpus-variants` (current production state)

**Process:**
1. Load anonymized alerts from staging bucket
2. Extract behavioral feature vectors per technique:
   - Process command line: tokenized args, binary name, parent process chain
   - File operations: paths, extensions, access patterns
   - Network activity: ports, protocols, connection direction
   - Registry operations: keys, value types, operation types
3. Run HDBSCAN clustering per MITRE technique with `min_cluster_size=50`
4. Generate cluster summaries:
   - Cluster ID, size, technique label
   - Representative examples (3 per cluster)
   - Behavioral signature: common command patterns, file paths, network indicators
5. Compare clusters to existing variant bank:
   - Label **NEW** if behavioral signature differs from all existing variants (Jaccard similarity < 0.7)
   - Label **DRIFT** if similar to existing variant but with notable differences (0.7 <= similarity < 0.9)
   - Label **DUPLICATE** if near-identical to existing variant (similarity >= 0.9)
6. Generate variant candidate report for analyst review

**Output:**
- `s3://argus-variant-bank-staging/quarter=YYYY-QN/clusters.jsonl` (one cluster per line)
- `s3://argus-variant-bank-staging/quarter=YYYY-QN/candidate_report.html` (analyst review interface)
- `s3://argus-variant-bank-staging/quarter=YYYY-QN/clustering_metrics.json` (silhouette scores, cluster counts)

**Validation:**
- At least 20% of clusters labeled **NEW** (validates discovery of novel patterns)
- **DUPLICATE** rate < 40% (validates freshness; if too high, indicates stale data or over-clustering)
- Silhouette score >= 0.4 per technique (validates clustering quality)

**Responsibilities:**
- **SOC Automation Team:** Execute clustering workflow, tune parameters if quality metrics fail
- **On-call Engineer:** Monitor job execution, escalate long-running jobs (>6 hours)

## Phase 3: Analyst Review (Week -6 to -4)

**Trigger:** Successful completion of Phase 2 clustering analysis

**Interface:** `candidate_report.html` hosted at `https://argus-internal.elastic.dev/variant-review/YYYY-QN/`

**Input:**
- `s3://argus-variant-bank-staging/quarter=YYYY-QN/clusters.jsonl`
- `s3://argus-variant-bank-staging/quarter=YYYY-QN/candidate_report.html`

**Process:**
1. Security Research Analysts access the review interface (SSO required)
2. For each **NEW** or **DRIFT** cluster candidate:
   - Review representative examples (command lines, file paths, network activity)
   - Assess whether cluster represents a genuine evasion technique or operational variation
   - Label cluster with quality annotation:
     - **APPROVED**: High-quality evasion pattern; include in variant bank
     - **REJECTED**: Noisy cluster, benign activity, or insufficient distinctiveness
     - **NEEDS_REFINEMENT**: Borderline case; requires behavioral signature adjustment
   - Add free-text notes explaining rationale
3. Analysts may merge similar clusters or split overly broad clusters via review UI
4. Review session captured to audit log: `s3://argus-variant-bank-staging/quarter=YYYY-QN/review_audit.jsonl`

**Output:**
- `s3://argus-variant-bank-staging/quarter=YYYY-QN/approved_variants.jsonl` (analyst-approved clusters)
- `s3://argus-variant-bank-staging/quarter=YYYY-QN/review_audit.jsonl` (timestamped analyst decisions)

**Quality Gates:**
- **APPROVED** rate >= 30% of **NEW** clusters (validates discovery of quality patterns)
- **REJECTED** rate <= 50% (validates clustering precision; if too high, tune clustering params)
- All **NEW** clusters reviewed (zero unreviewed clusters)

**Responsibilities:**
- **Security Research Analysts:** Review all candidate clusters, provide quality labels and rationale
- **SOC Automation Team:** Triage **NEEDS_REFINEMENT** cases, adjust clustering config if needed
- **Team Lead:** Final approval gate for quarterly refresh; sign-off on approved_variants.jsonl

## Phase 4: Corpus Integration (Week -3)

**Trigger:** Team Lead approval of `approved_variants.jsonl`

**Workflow:** `soc-argus-integrate-variants`

**Input:**
- `s3://argus-variant-bank-staging/quarter=YYYY-QN/approved_variants.jsonl`
- Production corpus: `.soc-eval-corpus-production-baseline`
- Existing variant bank: `.soc-eval-corpus-variants`

**Process:**
1. Load approved variants from staging bucket
2. For each approved cluster:
   - Select 5 representative samples from cluster (diversity sampling)
   - Generate variant document with schema:
     ```json
     {
       "variant_id": "T1059.001-drift-2026-q2-cluster-42",
       "technique": "T1059.001",
       "variant_type": "evasion_permutation",
       "behavioral_signature": {
         "command_pattern": ["powershell.exe", "-encodedCommand", "..."],
         "file_operations": [{"path": "C:\\Windows\\Temp\\*.tmp", "action": "create"}],
         "network_indicators": [{"port": 443, "protocol": "tcp", "direction": "outbound"}]
       },
       "representative_samples": [ /* 5 ECS events */ ],
       "provenance": {
         "source": "analytics_cluster_q2_2026",
         "cluster_id": "cluster-42",
         "analyst_approved_by": "analyst@elastic.co",
         "approved_date": "2026-05-15T10:30:00Z",
         "approval_rationale": "Novel PowerShell obfuscation via base64-encoded command with temp file staging"
       },
       "metadata": {
         "created_at": "2026-05-20T14:00:00Z",
         "quarterly_refresh": "2026-Q2"
       }
     }
     ```
3. Write variant documents to `.soc-eval-corpus-variants` index with `op_type: create` (fail on duplicate)
4. Update production-baseline corpus `.soc-eval-corpus-production-baseline` to include variants as negative samples
5. Generate integration report: variant counts by technique, coverage delta vs previous quarter

**Output:**
- Updated `.soc-eval-corpus-variants` index (immutable append-only)
- Updated `.soc-eval-corpus-production-baseline` index
- `s3://argus-variant-bank-staging/quarter=YYYY-QN/integration_report.json`

**Validation:**
- Zero duplicate variant IDs (validates uniqueness)
- Variant count increase >= 50 (validates meaningful refresh)
- All MITRE techniques with approved variants now have corresponding corpus entries

**Responsibilities:**
- **SOC Automation Team:** Execute integration workflow, validate index writes, publish integration report
- **On-call Engineer:** Monitor workflow execution, escalate index write failures

## Phase 5: Validation (Week -2)

**Trigger:** Successful completion of Phase 4 corpus integration

**Workflow:** `soc-argus-eval-quarterly-regression`

**Input:**
- Updated `.soc-eval-corpus-production-baseline` index
- Updated `.soc-eval-corpus-variants` index
- Baseline eval results from previous quarter: `s3://argus-evals/quarter=YYYY-QN-1/baseline_results.json`

**Process:**
1. Run full ARGUS eval suite against updated corpus:
   - All active detection rules (from `.soc-detection-rules-metadata`)
   - All registered ARGUS workflows (from `.soc-argus-workflows`)
   - Eval config: `config/quarterly_regression_eval.yaml`
2. Compute performance deltas vs previous quarter:
   - Precision/recall changes per technique
   - False positive rate changes
   - New failure modes introduced by new variants
3. Flag regressions:
   - **CRITICAL**: Precision drop > 10% on any technique
   - **HIGH**: Recall drop > 5% on any technique
   - **MEDIUM**: FP rate increase > 15% on any rule
4. Generate regression report with root cause analysis for flagged regressions

**Output:**
- `s3://argus-evals/quarter=YYYY-QN/regression_results.json`
- `s3://argus-evals/quarter=YYYY-QN/regression_report.html` (visual dashboard)
- Slack notification to `#argus-eval-alerts` with regression summary

**Quality Gates:**
- Zero **CRITICAL** regressions (hard block on deployment)
- **HIGH** regressions < 3 (requires mitigation plan)
- **MEDIUM** regressions < 10 (acceptable; track in backlog)

**Responsibilities:**
- **Detection Engineering:** Review regression report, triage regressions, create mitigation tasks
- **SOC Automation Team:** Execute eval workflow, publish results
- **Team Lead:** Approve deployment if quality gates pass OR sign off on mitigation plan for **HIGH** regressions

## Phase 6: Deployment (Week -1)

**Trigger:** Team Lead approval after validation phase

**Workflow:** `soc-argus-deploy-corpus-update`

**Input:**
- Updated `.soc-eval-corpus-production-baseline` index (staged)
- Updated `.soc-eval-corpus-variants` index (staged)
- Approval ticket: `ARGUS-YYYY-QN-CORPUS-DEPLOY`

**Process:**
1. Create index aliases to promote staged indices to production:
   ```
   POST /_aliases
   {
     "actions": [
       { "add": { "index": ".soc-eval-corpus-production-baseline-2026-q2", "alias": ".soc-eval-corpus-production-baseline" } },
       { "remove": { "index": ".soc-eval-corpus-production-baseline-2026-q1", "alias": ".soc-eval-corpus-production-baseline" } },
       { "add": { "index": ".soc-eval-corpus-variants-2026-q2", "alias": ".soc-eval-corpus-variants" } },
       { "remove": { "index": ".soc-eval-corpus-variants-2026-q1", "alias": ".soc-eval-corpus-variants" } }
     ]
   }
   ```
2. Verify alias switchover: query new indices via alias, confirm expected document counts
3. Trigger dependent workflows to refresh cached corpora:
   - `soc-argus-eval-harness` (updates eval dataset cache)
   - `soc-argus-difficulty-controller` (recalibrates variant difficulty scores)
4. Monitor post-deployment metrics for 24 hours:
   - Eval run success rate
   - Corpus query latency
   - Index disk usage
5. Retain previous quarter's indices for 90 days (rollback window)

**Output:**
- Production indices promoted via alias switch
- Deployment audit log: `s3://argus-deployments/quarter=YYYY-QN/corpus_deployment_log.json`
- Slack notification to `#argus-deployments` with deployment summary

**Rollback Procedure:**
If post-deployment issues arise within 24 hours:
1. Revert aliases to previous quarter's indices
2. File incident report: root cause, impact, corrective actions
3. Schedule emergency review session with Team Lead

**Responsibilities:**
- **SOC Automation Team:** Execute deployment workflow, monitor post-deployment metrics
- **On-call Engineer:** 24-hour watch for deployment issues, execute rollback if needed
- **Team Lead:** Sign-off on deployment completion

## Automation & Tooling

**Workflows:**
- `soc-argus-analytics-sync-quarterly` (Phase 1)
- `soc-argus-cluster-production-alerts` (Phase 2)
- `soc-argus-integrate-variants` (Phase 4)
- `soc-argus-eval-quarterly-regression` (Phase 5)
- `soc-argus-deploy-corpus-update` (Phase 6)

**Configuration Files:**
- `config/production_clustering_config.yaml` (clustering hyperparameters)
- `config/quarterly_regression_eval.yaml` (eval suite config)
- `config/pii_scrubbing_rules.yaml` (PII detection patterns)

**Monitoring Dashboards:**
- **Variant Bank Health:** `https://argus-internal.elastic.dev/dashboards/variant-bank-health`
  - Metrics: variant count by technique, quarterly growth rate, duplicate rate, coverage percentage
- **Quarterly Refresh Status:** `https://argus-internal.elastic.dev/dashboards/quarterly-refresh`
  - Metrics: phase completion status, quality gate pass/fail, regression counts, deployment status

**Alert Channels:**
- `#argus-eval-alerts` (Slack): Regression detection, quality gate failures
- `#argus-deployments` (Slack): Deployment notifications, rollback alerts
- PagerDuty: Critical workflow failures, PII leakage detection

## Compliance & Auditing

**PII Protection:**
- All production data extraction subject to automated PII scanning (`argus-pii-detector`)
- Monthly PII audit: random sample of 1000 anonymized events re-scanned
- Incident response: If PII leakage detected, immediate S3 bucket quarantine + legal notification

**Data Retention:**
- Staging bucket: 90 days after deployment (rollback window)
- Audit logs: 2 years (compliance requirement)
- Old corpus indices: 90 days after alias switchover (rollback window)

**Access Control:**
- Analytics cluster: Read-only service account, rotate credentials quarterly
- Staging bucket: SOC Automation Team, Security Research Analysts (SSO required)
- Review interface: Security Research Analysts only (SSO + MFA required)

**Audit Logs:**
- Data extraction: Source query, event count, PII scrubbing status
- Analyst review: Cluster ID, analyst email, decision (approve/reject), timestamp, rationale
- Deployment: Alias switchover, index names, approver, timestamp

## Success Metrics

**Operational Metrics:**
- **On-time Delivery:** 100% of quarterly refreshes complete within scheduled timeline
- **Quality Gate Pass Rate:** >= 95% of refreshes pass validation without **CRITICAL** regressions
- **Analyst Review Throughput:** Average 100 clusters reviewed per analyst per week

**Product Metrics:**
- **Variant Bank Growth:** >= 50 new approved variants per quarter
- **Coverage Expansion:** MITRE technique coverage improves by >= 5% per year
- **Eval Quality Improvement:** Precision/recall scores improve by >= 3% per year (measured on holdout set)

**Risk Metrics:**
- **PII Leakage Rate:** Zero incidents per year (target: 100% clean audits)
- **Rollback Rate:** < 5% of deployments (target: < 1 rollback per year)
- **Analyst Reject Rate:** 30-50% of clusters rejected (validates precision; too low = noisy pipeline, too high = overly conservative clustering)

## Escalation & Contacts

**Primary Contacts:**
- **SOC Automation Team Lead:** [TBD] (workflow execution, deployment approval)
- **Security Research Lead:** [TBD] (analyst review coordination, quality standards)
- **Analytics Platform Lead:** [TBD] (data extraction, cluster access)

**Escalation Path:**
1. **L1 (On-call Engineer):** Workflow failures, monitoring alerts
2. **L2 (SOC Automation Team Lead):** Quality gate failures, deployment blockers
3. **L3 (Security Director):** PII incidents, compliance issues, timeline risks

**Runbooks:**
- **Workflow Failure Recovery:** `docs/runbooks/quarterly-refresh-failure-recovery.md`
- **PII Incident Response:** `docs/runbooks/pii-incident-response.md`
- **Emergency Rollback:** `docs/runbooks/corpus-rollback.md`

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-05-05 | ARGUS Team | Initial quarterly refresh schedule |

## References

- **ARGUS Analytics Data Strategy Proposal:** `openspec/changes/argus-analytics-data-strategy/proposal.md`
- **ARGUS Analytics Data Strategy Design:** `openspec/changes/argus-analytics-data-strategy/design.md`
- **PII Scrubbing Protocol:** `docs/security/pii-scrubbing-protocol.md`
- **Variant Bank Schema:** `docs/schemas/variant-bank-schema.md`
- **MITRE ATT&CK Coverage Map:** `docs/reference/mitre-coverage-map.md`
