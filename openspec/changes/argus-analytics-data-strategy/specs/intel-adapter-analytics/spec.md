# SOC ARGUS Intel Adapter - Analytics Variant

## Overview

This document specifies the `soc-argus-intel-adapter-analytics` workflow variant, which queries the `ia-cti_enrichment` index in the analytics SDE cluster to extract cyber threat intelligence (CTI) enrichment data and populate the `.soc-cve-advisories` index. This workflow complements existing intel adapter workflows by leveraging production-grounded threat intelligence from real customer deployments.

## Goals

- Extract CTI enrichment data from the analytics cluster's `ia-cti_enrichment` index
- Transform and anonymize threat intelligence while preserving actionable indicators
- Populate the `.soc-cve-advisories` index with production-grounded intel for detection engineering
- Support the exploit-to-detection advisory pipeline with real-world threat data
- Maintain strict PII compliance throughout the extraction and transformation pipeline

## Architecture

### Workflow Identity

- **Workflow ID**: `soc-argus-intel-adapter-analytics`
- **Workflow Type**: Batch ETL pipeline (scheduled)
- **Schedule**: Daily at 02:00 UTC
- **Execution Environment**: Kibana background task / scheduled job
- **Authentication**: Service account with read-only access to analytics cluster via Kibana proxy

### Data Flow

```
Analytics Cluster                ARGUS Cluster
┌─────────────────────┐         ┌──────────────────────┐
│ ia-cti_enrichment   │         │ .soc-cve-advisories  │
│ (production data)   │ ──────> │ (anonymized intel)   │
└─────────────────────┘         └──────────────────────┘
         │                                 ▲
         │                                 │
         └─────> [Query & Extract] ───────┘
                 [Anonymize & Transform]
                 [Validate & Load]
```

### Input Data Source

**Index**: `ia-cti_enrichment`

**Schema** (expected fields):
- `threat.indicator.type`: Type of indicator (e.g., "url", "domain", "ip", "file_hash", "email")
- `threat.indicator.ip`: IP address (for IP-based indicators)
- `threat.indicator.domain`: Domain name (for domain-based indicators)
- `threat.indicator.url.full`: Full URL (for URL-based indicators)
- `threat.indicator.file.hash.sha256`: SHA-256 hash (for file-based indicators)
- `threat.enrichments.matched.atomic`: Matched threat intelligence atomic indicator
- `threat.enrichments.matched.type`: Type of matched threat
- `threat.enrichments.matched.field`: Field that matched
- `threat.software.name`: Malware family or tool name (e.g., "CobaltStrike", "Mimikatz")
- `threat.tactic.name`: MITRE ATT&CK tactic name
- `threat.technique.id`: MITRE ATT&CK technique ID (e.g., "T1059.001")
- `threat.technique.name`: MITRE ATT&CK technique name
- `vulnerability.id`: CVE identifier (e.g., "CVE-2024-1234")
- `vulnerability.severity`: Severity score or rating
- `vulnerability.description`: Vulnerability description
- `@timestamp`: Event timestamp
- `event.kind`: Event kind (expected: "enrichment")
- `event.category`: Event category (expected: "threat")
- `event.type`: Event type (expected: "indicator")

**Query Criteria**:
- Time range: Last 24 hours (configurable via `time_range_hours` parameter, default: 24)
- Event filter: `event.kind: enrichment AND event.category: threat`
- Minimum severity: configurable (default: medium and above)
- Exclude internal test data: exclude documents with `tags: ["test", "synthetic"]`

### Output Data Schema

**Index**: `.soc-cve-advisories`

**Document Schema**:
```json
{
  "advisory_id": "string (unique ID: <source>-<timestamp>-<hash>)",
  "advisory_type": "string (cti_enrichment | cve | threat_intel)",
  "source": "string (analytics_cluster)",
  "created_at": "date (ISO 8601)",
  "ingested_at": "date (ISO 8601)",
  "threat": {
    "indicator": {
      "type": "string",
      "value": "string (anonymized if contains PII)",
      "confidence": "string (high | medium | low)"
    },
    "software": {
      "name": "string",
      "type": "string (malware | tool | exploit_kit)"
    },
    "tactic": {
      "id": "string (MITRE ATT&CK tactic ID)",
      "name": "string"
    },
    "technique": {
      "id": "string (e.g., T1059.001)",
      "name": "string"
    }
  },
  "vulnerability": {
    "id": "string (CVE ID)",
    "severity": "string (critical | high | medium | low)",
    "description": "string",
    "cvss_score": "number (0-10)"
  },
  "detection_guidance": {
    "detection_type": "string (signature | behavioral | anomaly)",
    "recommended_data_sources": ["array of strings (e.g., process, network, file)"],
    "notes": "string (analyst notes for detection engineering)"
  },
  "metadata": {
    "source_index": "string (ia-cti_enrichment)",
    "source_timestamp": "date",
    "anonymization_applied": "boolean",
    "validation_status": "string (valid | needs_review | invalid)"
  }
}
```

## Data Processing Pipeline

### Phase 1: Query & Extract

**Implementation**: `queryAnalyticsCluster()`

**Process**:
1. Authenticate to analytics cluster via Kibana proxy using service account credentials
2. Build Elasticsearch query:
   ```json
   {
     "query": {
       "bool": {
         "must": [
           { "match": { "event.kind": "enrichment" } },
           { "match": { "event.category": "threat" } },
           {
             "range": {
               "@timestamp": {
                 "gte": "now-24h/h",
                 "lte": "now/h"
               }
             }
           }
         ],
         "must_not": [
           { "terms": { "tags": ["test", "synthetic"] } }
         ],
         "should": [
           { "exists": { "field": "vulnerability.id" } },
           { "exists": { "field": "threat.software.name" } },
           { "exists": { "field": "threat.indicator.ip" } },
           { "exists": { "field": "threat.indicator.domain" } }
         ],
         "minimum_should_match": 1
       }
     },
     "sort": [{ "@timestamp": "desc" }],
     "size": 10000
   }
   ```
3. Execute scroll query to retrieve all matching documents (handle pagination for > 10K results)
4. Collect raw documents into in-memory buffer (with memory limits and streaming if needed)
5. Log extraction statistics: document count, date range, indicator type distribution

**Output**: Array of raw CTI enrichment documents

**Error Handling**:
- Authentication failure: Log error, send alert to `#argus-alerts`, abort workflow
- Query timeout (>60s): Retry with smaller batch size, then alert if persistent
- Network errors: Retry up to 3 times with exponential backoff

### Phase 2: Anonymize & Transform

**Implementation**: `anonymizeAndTransform()`

**Process**:
1. For each extracted document, apply anonymization transforms:
   - **IP addresses**:
     - Strip last octet for IPv4 (e.g., `192.168.1.100` → `192.168.1.0/24`)
     - Strip last 64 bits for IPv6
     - Exception: Known public threat actor IPs (preserve for detection value)
   - **Domain names**:
     - Strip subdomains if they contain org-specific identifiers (e.g., `customer123.evil.com` → `*.evil.com`)
     - Preserve known malicious domains exactly (e.g., `evil.com`)
   - **URLs**:
     - Strip query parameters containing PII patterns (email, user ID, session tokens)
     - Preserve path structure and domain
   - **File hashes**: Preserve exactly (no PII risk)
   - **Email addresses**: Hash with salt from `~/.argus/secrets/email_salt`
   - **Vulnerability IDs**: Preserve exactly (public CVE identifiers)

2. Transform to `.soc-cve-advisories` schema:
   - Generate `advisory_id`: `analytics-cti-${timestamp}-${sha256(indicator_value).substring(0, 8)}`
   - Set `advisory_type`:
     - `cve` if `vulnerability.id` exists
     - `threat_intel` if `threat.software.name` exists
     - `cti_enrichment` otherwise
   - Map `threat.indicator.type` → `threat.indicator.type`
   - Extract `threat.software.name` → determine `threat.software.type`:
     - Known malware families (CobaltStrike, Mimikatz, etc.) → `malware`
     - Known penetration testing tools → `tool`
     - Known exploit kits → `exploit_kit`
   - Map MITRE ATT&CK fields directly (no transformation needed)
   - Set `detection_guidance.recommended_data_sources` based on technique ID:
     - T1059.* (command execution) → `["process", "command_line"]`
     - T1071.* (application layer protocol) → `["network", "dns", "http"]`
     - T1053.* (scheduled task) → `["process", "file", "registry"]`
     - Default → `["process", "network", "file"]`

3. Validate transformed documents:
   - Required fields present: `advisory_id`, `advisory_type`, `source`, `created_at`
   - At least one of: `threat.indicator`, `vulnerability.id`, `threat.software.name`
   - MITRE technique ID format: matches `T\d{4}(\.\d{3})?`
   - CVE ID format: matches `CVE-\d{4}-\d{4,}`

4. Mark validation status:
   - `valid`: All required fields present, formats correct
   - `needs_review`: Missing optional fields or unusual values
   - `invalid`: Required fields missing or malformed data

**Output**: Array of transformed and anonymized advisory documents

**Error Handling**:
- Malformed source data: Log warning, mark as `invalid`, continue processing
- Anonymization failure: Log error, exclude document from batch, continue
- Validation failure: Mark as `needs_review`, include in batch for manual review

### Phase 3: Validate & Load

**Implementation**: `validateAndLoad()`

**Process**:
1. Perform final validation checks:
   - PII leakage scan: Run regex patterns against all text fields
     - Email patterns: `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`
     - Internal hostname patterns: `*.internal.elastic.co`, `*.es.io`
     - Customer org identifiers: configured blocklist
   - Duplicate check: Query `.soc-cve-advisories` for existing `advisory_id`
   - Schema validation: Ensure all documents conform to index mapping

2. Separate documents into batches:
   - **Valid batch**: Documents passing all validation checks
   - **Review batch**: Documents marked `needs_review` (write to separate review queue)
   - **Invalid batch**: Documents failing validation (log and discard)

3. Bulk index valid documents to `.soc-cve-advisories`:
   - Use bulk API with `op_type: create` (fail on duplicate IDs)
   - Batch size: 500 documents per bulk request
   - Refresh: `wait_for` (ensure documents visible immediately for downstream workflows)

4. Write review batch to `.soc-cve-advisories-review` index (analyst review queue)

5. Log summary statistics:
   - Total documents extracted
   - Valid documents indexed
   - Documents requiring review
   - Invalid documents discarded
   - Duplicate advisory IDs skipped
   - PII violations detected (should be zero)

6. Send Slack notification to `#argus-intel-pipeline`:
   ```
   ✅ Intel Adapter (Analytics) completed
   📊 Extracted: 1,234 CTI records
   ✅ Indexed: 1,150 advisories
   ⚠️  Review queue: 75 documents
   ❌ Invalid: 9 documents
   🔒 PII violations: 0
   ```

**Output**:
- Documents indexed to `.soc-cve-advisories`
- Review queue documents in `.soc-cve-advisories-review`
- Workflow execution log

**Error Handling**:
- PII leakage detected: **ABORT IMMEDIATELY**, quarantine batch, send PagerDuty alert
- Bulk index failure: Retry individual documents, log failures, alert if >10% failure rate
- Duplicate advisory IDs: Skip (expected for re-runs), log count
- Index mapping conflict: Log error, alert DevOps, abort workflow

## Configuration

**Workflow Configuration File**: `config/intel_adapter_analytics_config.yaml`

```yaml
workflow:
  id: soc-argus-intel-adapter-analytics
  schedule: "0 2 * * *"  # Daily at 02:00 UTC
  timeout_minutes: 30
  max_retries: 3

source:
  cluster_url: "${ANALYTICS_CLUSTER_URL}"
  index: "ia-cti_enrichment"
  time_range_hours: 24
  max_documents: 50000
  scroll_size: 1000
  scroll_timeout: "5m"

filters:
  event_kind: "enrichment"
  event_category: "threat"
  exclude_tags: ["test", "synthetic"]
  min_severity: "medium"

anonymization:
  salt_file: "~/.argus/secrets/analytics_salt"
  pii_patterns_file: "config/pii_patterns.yaml"
  preserve_known_threats: true
  known_threat_allowlist_file: "config/known_threat_allowlist.yaml"

destination:
  index: ".soc-cve-advisories"
  review_index: ".soc-cve-advisories-review"
  bulk_batch_size: 500
  refresh: "wait_for"

notifications:
  slack_channel: "#argus-intel-pipeline"
  slack_webhook_url: "${SLACK_WEBHOOK_URL}"
  pagerduty_service_key: "${PAGERDUTY_SERVICE_KEY}"
  alert_on_pii_violation: true
  alert_on_high_failure_rate: true
  failure_rate_threshold: 0.1  # Alert if >10% documents fail

monitoring:
  emit_metrics: true
  metrics_prefix: "argus.intel_adapter.analytics"
  log_level: "info"
  log_destination: "elasticsearch"
  log_index: ".soc-argus-workflow-logs"
```

## Monitoring & Alerting

### Key Metrics

**Operational Metrics** (emitted to Kibana monitoring):
- `argus.intel_adapter.analytics.documents_extracted`: Count of documents extracted from analytics cluster
- `argus.intel_adapter.analytics.documents_indexed`: Count of documents successfully indexed
- `argus.intel_adapter.analytics.documents_review_queue`: Count of documents requiring manual review
- `argus.intel_adapter.analytics.documents_invalid`: Count of invalid documents discarded
- `argus.intel_adapter.analytics.execution_time_ms`: Workflow execution duration
- `argus.intel_adapter.analytics.pii_violations`: Count of PII violations detected (target: 0)

**Quality Metrics**:
- `argus.intel_adapter.analytics.validation_pass_rate`: Percentage of documents passing validation
- `argus.intel_adapter.analytics.duplicate_rate`: Percentage of duplicate advisory IDs
- `argus.intel_adapter.analytics.indicator_type_distribution`: Breakdown by indicator type (ip, domain, hash, etc.)
- `argus.intel_adapter.analytics.technique_coverage`: Count of unique MITRE technique IDs extracted

### Alerts

**Critical Alerts** (PagerDuty):
- PII violation detected (immediate escalation)
- Authentication failure to analytics cluster
- Index write failure rate > 50%
- Workflow timeout or crash

**Warning Alerts** (Slack #argus-alerts):
- Validation failure rate > 20%
- Zero documents extracted (possible query issue)
- Duplicate rate > 50% (stale data or config issue)
- Execution time > 20 minutes (performance degradation)

### Dashboards

**Dashboard**: `https://argus-internal.elastic.dev/dashboards/intel-adapter-analytics`

**Panels**:
1. **Extraction Volume Over Time**: Line chart of documents extracted per day
2. **Validation Pass Rate**: Percentage gauge (target: >90%)
3. **Indicator Type Distribution**: Pie chart of threat indicator types
4. **MITRE Technique Coverage**: Bar chart of top 20 techniques by document count
5. **Workflow Execution Time**: Line chart of execution duration over time
6. **PII Violations**: Alert panel (should always show zero)
7. **Review Queue Depth**: Line chart of documents pending analyst review

## Security & Compliance

### Authentication & Authorization

- **Service Account**: `svc-argus-intel-adapter` with read-only access to `ia-cti_enrichment`
- **Credential Storage**: Kibana encrypted saved objects (not plaintext config)
- **Credential Rotation**: Automated quarterly rotation via Vault integration
- **Audit Logging**: All authentication attempts logged to `.security-audit-log`

### PII Protection

**Anonymization Protocol**:
1. Strip customer-identifying metadata: `cluster_name`, `cluster_uuid`, `org_id`
2. Hash sensitive identifiers: `agent.id`, `user.email`
3. Redact IP addresses (except known threat actor IPs)
4. Strip query parameters from URLs
5. Remove file paths containing user directories

**PII Detection**:
- Automated regex-based scanning before index write
- Patterns: email addresses, internal hostnames, IP ranges, customer org names
- **Zero-tolerance policy**: Any PII detection aborts workflow immediately

**Compliance**:
- All data extraction logged to audit trail
- 90-day retention for `.soc-cve-advisories-review` (analyst review queue)
- Anonymization audit: Monthly random sample validation

### Data Retention

- **`.soc-cve-advisories`**: 365 days (rolling deletion)
- **`.soc-cve-advisories-review`**: 90 days (analyst review queue)
- **`.soc-argus-workflow-logs`**: 180 days (audit trail)
- **Deleted records**: Archived to S3 cold storage for compliance (7 years)

## Testing & Validation

### Unit Tests

**Test Coverage**:
- `queryAnalyticsCluster()`: Mock ES client, test query construction, pagination, error handling
- `anonymizeAndTransform()`: Test anonymization logic, schema mapping, validation rules
- `validateAndLoad()`: Test PII detection, duplicate handling, bulk indexing

**Test Data**: Synthetic CTI enrichment documents with known PII patterns (must be stripped)

### Integration Tests

**Test Scenario 1: End-to-End Happy Path**
- Mock analytics cluster with 100 synthetic CTI documents
- Execute full workflow
- Assert: All documents extracted, anonymized, and indexed
- Assert: Zero PII violations detected
- Assert: Slack notification sent

**Test Scenario 2: PII Leakage Detection**
- Inject document with embedded email address
- Execute anonymization phase
- Assert: PII detected, workflow aborted, PagerDuty alert sent

**Test Scenario 3: Duplicate Advisory Handling**
- Insert existing advisory into `.soc-cve-advisories`
- Extract same document from mock analytics cluster
- Execute workflow
- Assert: Duplicate skipped, no error thrown, logged as expected

**Test Scenario 4: Analytics Cluster Unavailable**
- Mock network failure to analytics cluster
- Execute workflow
- Assert: Retry logic triggers, workflow eventually fails, alert sent

### Manual Validation Checklist

Before production deployment:
- [ ] Service account credentials configured and tested
- [ ] Salt file (`~/.argus/secrets/analytics_salt`) generated and secured
- [ ] PII pattern allowlist reviewed and approved by Security team
- [ ] Test workflow against analytics **staging** cluster with real data
- [ ] Validate anonymization: Manually inspect 50 random documents for PII
- [ ] Verify alert channels: Trigger test PII violation, confirm PagerDuty alert
- [ ] Review dashboard: Confirm all panels render correctly
- [ ] Dry-run: Execute workflow with `dry_run: true` flag (no index writes)

## Deployment

### Prerequisites
- Kibana version >= 8.10.0 (for scheduled workflow support)
- Service account `svc-argus-intel-adapter` provisioned
- Index templates for `.soc-cve-advisories` and `.soc-cve-advisories-review` created
- Salt file generated: `openssl rand -base64 32 > ~/.argus/secrets/analytics_salt`
- Configuration file deployed: `config/intel_adapter_analytics_config.yaml`

### Deployment Steps

1. **Create index templates**:
   ```bash
   curl -X PUT "${KIBANA_URL}/_index_template/soc-cve-advisories" \
     -H "Content-Type: application/json" \
     -d @index_templates/soc-cve-advisories.json
   ```

2. **Deploy workflow configuration**:
   ```bash
   cp config/intel_adapter_analytics_config.yaml \
     /etc/kibana/argus/workflows/intel_adapter_analytics.yaml
   ```

3. **Register workflow with scheduler**:
   ```bash
   curl -X POST "${KIBANA_URL}/api/argus/workflows/register" \
     -H "Content-Type: application/json" \
     -d '{"workflow_id": "soc-argus-intel-adapter-analytics", "config_path": "/etc/kibana/argus/workflows/intel_adapter_analytics.yaml"}'
   ```

4. **Enable workflow**:
   ```bash
   curl -X POST "${KIBANA_URL}/api/argus/workflows/enable/soc-argus-intel-adapter-analytics"
   ```

5. **Verify first run**:
   - Monitor logs: `tail -f /var/log/kibana/argus-workflows.log | grep intel-adapter-analytics`
   - Check dashboard: Confirm metrics populated
   - Inspect index: Query `.soc-cve-advisories` for new documents

### Rollback Procedure

If issues arise post-deployment:
1. Disable workflow: `curl -X POST "${KIBANA_URL}/api/argus/workflows/disable/soc-argus-intel-adapter-analytics"`
2. Delete newly created documents:
   ```json
   POST .soc-cve-advisories/_delete_by_query
   {
     "query": {
       "range": {
         "ingested_at": {
           "gte": "now-1h"
         }
       }
     }
   }
   ```
3. Investigate root cause via logs and metrics
4. Fix and re-deploy

## Success Criteria

**Operational Success**:
- [ ] Workflow executes daily without manual intervention
- [ ] Execution time consistently < 15 minutes
- [ ] Zero PII violations detected in production
- [ ] Alert noise < 1 false alarm per week

**Quality Success**:
- [ ] Validation pass rate > 90%
- [ ] Duplicate rate < 10% (indicates fresh data)
- [ ] MITRE technique coverage > 50 unique techniques per week
- [ ] Analyst review queue depth < 100 documents (indicates high precision)

**Business Success**:
- [ ] Detection engineering team reports improved advisory quality vs. hand-crafted intel
- [ ] At least 10 new detection rules created using analytics-sourced advisories per quarter
- [ ] False positive rate for new rules decreases by 15% (production-grounded intel reduces FPs)

## Revision History

| Version | Date       | Author      | Changes                                      |
|---------|------------|-------------|----------------------------------------------|
| 1.0     | 2026-05-05 | ARGUS Team  | Initial workflow specification               |

## References

- **ARGUS Analytics Data Strategy Proposal**: `openspec/changes/argus-analytics-data-strategy/proposal.md`
- **PII Scrubbing Protocol**: `docs/security/pii-scrubbing-protocol.md`
- **Quarterly Variant Bank Refresh Schedule**: `openspec/changes/argus-analytics-data-strategy/specs/variant-bank-refresh/spec.md`
- **Elasticsearch Query DSL**: https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl.html
- **MITRE ATT&CK Framework**: https://attack.mitre.org/
