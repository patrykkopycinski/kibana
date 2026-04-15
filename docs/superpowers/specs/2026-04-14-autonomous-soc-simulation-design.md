# Autonomous SOC Simulation — Design Specification

**Date:** 2026-04-14
**Author:** Patryk Kopycinski
**Status:** Draft
**Aligned with:**
- [elastic/security-team#15972 — Agent Skills Ecosystem for Elastic Security](https://github.com/elastic/security-team/issues/15972)
- [elastic/security-team#16048 — Security Automation Vision and Strategy](https://github.com/elastic/security-team/issues/16048)

---

## 1. Vision

An always-running, self-evolving Autonomous SOC built entirely on Elastic-native primitives. Virtual machine endpoints continuously generate security telemetry via real attack emulation. A mesh of 7 specialized AI agents plus 1 deterministic response workflow autonomously detects, triages, investigates, responds to, and learns from threats — with zero human intervention. The system gets smarter over time: it tunes its own detection rules, creates new specialist agents when it discovers coverage gaps, and adapts attack complexity to its own competence level.

### Design Principles (from #15972)

- **Skills are system components, not features** — they produce durable artifacts (enriched alerts, cases, rule changes), not transient chat outputs
- **Outcome over interaction** — focus on measurable impact rather than conversation
- **Specialization over generalization** — focused skills for discrete tasks rather than one monolithic assistant
- **Human control is optional** — fully autonomous operation with complete audit trail
- **Composable skill + workflow model** — shared skill library and workflow automation for flexibility, consistency, and governance

### Strategic Positioning (from #16048)

This simulation demonstrates the "Shift from SOAR to Embedded Automation":
- Automation embedded in every security workflow, not a separate destination
- Hybrid workflows: deterministic steps + AI skill steps in a single definition
- AI Skills as composable workflow steps that execute inside workflows, not alongside them
- Self-improving detection via feedback loops — the differentiator no competitor has shipped

---

## 2. Architecture Overview

### Deployment: Docker-First, Cloud-Ready

Two deployment modes from the same artifact bundle. Development uses a local Docker Compose stack on non-conflicting ports; production upgrades to Elastic Cloud + GCE with zero artifact changes — only the `.env` file differs.

#### Mode 1: Local Development (Docker Compose)

All services run in `soc-simulation/docker-compose.yml` using `9.4.0-SNAPSHOT` images. Ports are chosen to avoid conflict with default Kibana dev (5601/5620) and ES (9200/9220) ports.

```
Your machine (Docker)
┌───────────────────────────────────────────────────────────┐
│  docker-compose.yml                                       │
│                                                           │
│  ┌──────────────────┐  ┌──────────────────────────────┐   │
│  │ soc-elasticsearch│  │ soc-kibana                   │   │
│  │ :19200           │  │ :15601                       │   │
│  │ 9.4.0-SNAPSHOT   │  │ 9.4.0-SNAPSHOT               │   │
│  └────────┬─────────┘  │ (agents, workflows,          │   │
│           │            │  dashboards, rules, SML)      │   │
│  ┌────────┴─────────┐  └──────────────┬───────────────┘   │
│  │ soc-fleet-server │                 │                   │
│  │ :18220           │                 │                   │
│  │ 9.4.0-SNAPSHOT   │                 │                   │
│  └──────────────────┘                 │                   │
│                                       │                   │
│  ┌──────────────────┐  ┌──────────────┴───────────────┐   │
│  │ soc-caldera      │  │ soc-caldera-bridge           │   │
│  │ :18888           │  │ polls ES → calls Caldera API │   │
│  │ Caldera + Cortado│  │ (Python container)           │   │
│  └──────────────────┘  └─────────────────────────────┘   │
│                                                           │
└───────────────────────────────────────────────────────────┘

GCE VMs (always remote, both modes):
┌────────────────────────────────────────────────────────┐
│  ┌───────────┐  ┌───────────┐  ┌───────────┐          │
│  │linux-ws-1 │  │linux-ws-2 │  │linux-sv-1 │          │
│  │Agent→Fleet│  │Agent→Fleet│  │Agent→Fleet│          │
│  │Sandcat→Cal│  │Sandcat→Cal│  │Sandcat→Cal│          │
│  └───────────┘  └───────────┘  └───────────┘          │
│  (VMs reach Docker services via Tailscale / tunnel)    │
└────────────────────────────────────────────────────────┘

Port map:
  ES       → localhost:19200
  Kibana   → localhost:15601
  Fleet    → localhost:18220
  Caldera  → localhost:18888
```

**Why local Docker:**
- Access to latest `9.4.0-SNAPSHOT` features (`ai.agent`, `workflow.executeAsync`, event-driven workflows)
- Non-conflicting ports — run alongside `yarn start` dev server
- Portable — same `docker-compose.yml` runs on any machine
- Fast iteration — restart services in seconds

#### Mode 2: Cloud Production (Elastic Cloud + GCE)

Same artifacts, different `.env`:

```
.env.cloud:
  ES_URL=https://<deployment>.es.us-central1.gcp.cloud.es.io
  KIBANA_URL=https://<deployment>.kb.us-central1.gcp.cloud.es.io
  FLEET_URL=https://<deployment>.fleet.us-central1.gcp.cloud.es.io
  CALDERA_URL=http://<caldera-gce-internal-ip>:8888
  # Bridge polls ES_URL, calls CALDERA_URL — same container, different env
```

The Caldera bridge container runs on the GCE Caldera VM, polling Elastic Cloud ES. Endpoint VMs are GCE instances in the same VPC as Caldera. `setup.sh` points at the cloud Kibana URL — same APIs, same artifacts.

### Layer Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1: ATTACK EMULATION (Threat Generation)              │
│  Caldera + Cortado + Atomic Red Team → endpoint VMs         │
│  with Elastic Defend → Caldera Bridge (polls ES, calls      │
│  Caldera API) → Performance-gated escalating difficulty     │
├─────────────────────────────────────────────────────────────┤
│  LAYER 2: DETECTION (Signal Generation)                     │
│  Elastic Defend telemetry → logs-endpoint.events.*          │
│  Detection Rules (EQL, ES|QL, ML) → .alerts-security.*     │
├─────────────────────────────────────────────────────────────┤
│  LAYER 3: AGENT MESH (Autonomous Processing)                │
│  7 AI agents + 1 deterministic workflow, via executeAsync   │
│  on shared indices + SML shared brain                       │
│                                                             │
│  ┌─────────┐ ┌────────┐ ┌──────┐ ┌──────────┐             │
│  │ Triage  │→│ Entity │→│ Hunt │→│ Response │             │
│  └─────────┘ └────────┘ └──────┘ └──────────┘             │
│  ┌─────────┐ ┌────────────┐ ┌──────────┐ ┌─────────────┐  │
│  │  Case   │ │ DetEng     │ │ Watchdog │ │ Meta Agent  │  │
│  └─────────┘ └────────────┘ └──────────┘ └─────────────┘  │
│                                                             │
│  ╔═════════════════════════════════════════╗                │
│  ║  SML — Semantic Memory Layer            ║                │
│  ║  Shared brain across all agents         ║                │
│  ╚═════════════════════════════════════════╝                │
├─────────────────────────────────────────────────────────────┤
│  LAYER 4: RESPONSE (Automated Actions)                      │
│  Workflows for deterministic actions: isolate host,         │
│  kill process, block IOC, disable account                   │
├─────────────────────────────────────────────────────────────┤
│  LAYER 5: OBSERVABILITY (SOC Metrics — Dashboard-as-Code)   │
│  .soc-audit-trail → Kibana dashboards (NDJSON, git-tracked) │
│  MTTD, MTTR, automation rate, agent health, confidence      │
│  distribution, coverage gaps, evolution history              │
└─────────────────────────────────────────────────────────────┘
```

### Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Deployment** | Docker-first, cloud-ready. Local: Docker Compose on non-default ports (19200/15601/18220/18888). Cloud: same artifacts, different `.env` | Access to latest 9.4.0-SNAPSHOT features; no port conflicts; portable artifacts |
| **Stack images** | `9.4.0-SNAPSHOT` (ES, Kibana, Fleet Server) | Matches Kibana `main` branch version; has `ai.agent`, `workflow.executeAsync`, event-driven workflows |
| **Caldera hosting** | Docker container (local) or GCE VM (cloud), same VPC as endpoints | Intra-network to endpoints; bridge decouples from workflow engine |
| **Caldera bridge** | Polling agent — container polls `.soc-attack-commands` from ES, calls local Caldera API | Works in both local Docker and cloud GCE; no inbound networking required; consistent with index-based communication model |
| **Inter-agent communication** | `workflow.executeAsync` chaining | No custom plugin needed, near-instant, payloads via `inputs`, works with existing infrastructure |
| **Agent invocation** | `ai.agent` workflow step with `agent-id` property | Native workflow step type; passes message, returns structured output |
| **Data persistence** | Shared Elasticsearch indices per agent | Scalable, queryable, dashboard-ready, audit trail built-in |
| **Shared knowledge** | Agent Builder SML (Semantic Memory Layer) | Vector-backed knowledge base, all agents read/write, new agents inherit context |
| **Response actions** | Deterministic workflows (no LLM) | Auditable, fast, safe — no hallucinated response actions |
| **Attack generation** | Caldera + Cortado + Atomic Red Team via Caldera Bridge | Real endpoints, real Elastic Defend, real detection rules — genuine telemetry |
| **Difficulty scaling** | Performance-gated (not timer-based) | Adapts to SOC competence, creates adversarial training dynamic |
| **Dashboards** | NDJSON saved objects, git-tracked, deployed via setup script | Reproducible, diffable, reviewable |
| **Portability** | All artifacts in `soc-simulation/`, deployed via `setup.sh` REST API calls | Point at any Kibana URL to deploy; `teardown.sh` reverses cleanly |
| **Loop protection** | `hop_count` field, max 5 hops | Prevents circular agent chains |
| **Failure recovery** | `.soc-dead-letter` + Recovery Workflow | No silent failures, automatic retry with max 3 attempts |
| **Idempotency** | `correlation_id` deduplication check | Prevents duplicate processing from Task Manager retries |

---

## 3. Inter-Agent Communication

### Event Flow via workflow.executeAsync

Agents communicate through Elasticsearch indices as the durable data layer, with `workflow.executeAsync` as the triggering mechanism.

```
Detection Rule fires on real threat
    → alert trigger: Triage Workflow
    → ai.agent(soc-triage-agent), reads SML
    → writes .soc-triage-results (with correlation_id, hop_count=1)
    → writes learned patterns to SML
    → on-failure: write to .soc-dead-letter
    → workflow.executeAsync → Enrichment Workflow (confidence ≥ 40)
                            → Close Workflow (confidence < 40)

Enrichment Workflow (hop_count=2)
    → idempotency check on correlation_id
    → ai.agent(soc-entity-agent), reads SML
    → writes .soc-entity-enrichment
    → writes baselines to SML
    → on-failure: .soc-dead-letter
    → workflow.executeAsync → Investigation Workflow (confidence 40-69)
                            → Response Workflow (confidence ≥ 70)

Investigation Workflow (hop_count=3)
    → ai.agent(soc-hunt-agent), reads SML
    → writes .soc-hunt-findings
    → writes investigation patterns to SML
    → workflow.executeAsync → Response Workflow (if confidence now ≥ 70)
                            → Close Workflow (if still < 40 after investigation)

Response Workflow (deterministic, no agent)
    → isolate host / kill process / block IOC via kibana.request steps
    → writes .soc-response-actions
    → workflow.executeAsync → Case Workflow

Case Workflow
    → ai.agent(soc-case-agent)
    → creates Kibana case with full evidence chain
    → writes .soc-outcomes (final disposition, TTD, TTR, confidence_history)
    → writes to SML

Scheduled: Meta Agent Workflow (every 15min)
    → ai.agent(soc-meta-agent)
    → queries .soc-outcomes for patterns
    → tunes detection rules via security.create_detection_rule tool
    → creates new agents via Agent Builder API
    → writes .soc-evolution-log

Scheduled: Watchdog Workflow (every 5min)
    → ai.agent(soc-watchdog-agent)
    → checks agent throughput, latency, stalled pipelines
    → scans .soc-dead-letter for unrecovered items
    → signals Meta Agent on coverage gaps

Scheduled: Recovery Workflow (every 10min)
    → scans .soc-dead-letter (deterministic, no agent)
    → retries failed items (max 3 attempts)
    → escalates to Watchdog if exhausted

Scheduled: Difficulty Controller Workflow (every 5min)
    → evaluates SOC metrics via ES|QL
    → writes attack command to .soc-attack-commands
    → Caldera Bridge picks up command, executes via Caldera API
```

### Communication Indices

| Index | Producer | Consumer(s) | Key Fields |
|-------|----------|-------------|------------|
| `.soc-triage-results` | Triage Agent | Entity Agent, Hunt Agent | `correlation_id`, `confidence`, `classification`, `reasoning`, `enrichment_requests[]` |
| `.soc-entity-enrichment` | Entity Agent | Hunt Agent, Response Agent | `confidence`, `risk_context`, `anomalies[]`, `entity_ids[]` |
| `.soc-hunt-findings` | Hunt Agent | Response Agent, Case Agent, DetEng Agent | `confidence_delta`, `evidence[]`, `related_alerts[]`, `iocs[]` |
| `.soc-response-actions` | Response Workflow | Case Agent, Watchdog Agent | `action_type`, `target`, `status`, `workflow_execution_id` |
| `.soc-outcomes` | Case Agent | Meta Agent, DetEng Agent | `case_id`, `disposition`, `confidence_history[]`, `time_to_detect`, `time_to_respond` |
| `.soc-agent-health` | Watchdog Agent | Meta Agent | `agent_id`, `throughput`, `latency_p50/p95`, `error_rate`, `status` |
| `.soc-evolution-log` | Meta Agent, DetEng Agent | Watchdog Agent | `action_type`, `agent_id`, `reasoning`, `before/after` |
| `.soc-coverage-gaps` | Watchdog Agent | Meta Agent | `technique_id`, `occurrences`, `avg_confidence` |
| `.soc-dead-letter` | All workflows (on-failure) | Recovery Workflow | `source`, `correlation_id`, `error`, `retry_count` |
| `.soc-difficulty-state` | Difficulty Controller | Difficulty Controller | `level`, `level_name`, `reasoning` |
| `.soc-attack-commands` | Difficulty Controller | Caldera Bridge | `status`, `difficulty`, `profile`, `techniques[]`, `operation_id` |
| `.soc-audit-trail` | All workflows | Dashboards | `correlation_id`, `agent_name`, `action`, `timestamp` |

### Confidence Score Flow

Every document carries a `confidence` field (0–100) that accumulates through the chain:

| Range | Pipeline Path |
|-------|--------------|
| 90–100 | Triage → Entity → Response (isolate+kill) → Case (full auto) |
| 70–89 | Triage → Entity → Response (acknowledge) → Case (enriched auto-response) |
| 40–69 | Triage → Entity → Hunt → (re-evaluate) → Response or Close |
| 0–39 | Triage → auto-close, log to `.soc-outcomes` for Meta Agent review |

Confidence adjustments:
- Alert severity: critical=+30, high=+20, medium=+10, low=+5
- Entity risk: critical asset=+15, high risk score=+10
- Related alerts correlation: +5 per related alert, max +20
- SML pattern match: +/- 15
- Hunt corroborating evidence: +15 to +25
- Hunt exculpatory evidence: -15 to -25

### Safety Mechanisms

- **Hop counter:** Every payload includes `hop_count`. Any workflow receiving `hop_count > 5` writes to `.soc-dead-letter` instead of continuing.
- **Idempotency:** Every payload includes `correlation_id` (original alert ID + hop path hash). Agents check `.soc-audit-trail` for existing `correlation_id` before processing.
- **Dead letter:** All workflows include `on-failure` handlers that write to `.soc-dead-letter` with error context and `retry_count: 0`.
- **Recovery:** Scheduled Recovery Workflow retries dead-letter items (max 3 attempts), escalates to Watchdog if exhausted.

---

## 4. Telemetry Generation & Attack Emulation

### Infrastructure Stack

#### Local Mode (Docker Compose)

| Service | Container | Image | Host Port | Internal Port | Purpose |
|---------|-----------|-------|-----------|---------------|---------|
| Elasticsearch | `soc-elasticsearch` | `elasticsearch:9.4.0-SNAPSHOT` | **19200** | 9200 | Data store |
| Kibana | `soc-kibana` | `kibana:9.4.0-SNAPSHOT` | **15601** | 5601 | Agents, workflows, dashboards, rules, SML |
| Fleet Server | `soc-fleet-server` | `elastic-agent:9.4.0-SNAPSHOT` | **18220** | 8220 | Endpoint agent enrollment |
| Caldera | `soc-caldera` | Custom (Caldera + Cortado) | **18888** | 8888 | Attack orchestration |
| Caldera Bridge | `soc-caldera-bridge` | Custom (Python) | — | — | Polls ES, triggers Caldera |

Endpoint VMs always run on GCE (need real kernel for Elastic Defend, consistent environment for reproducible demos). In local mode, they enroll to Fleet Server via a public-facing tunnel or Tailscale; in cloud mode, they're in the same VPC.

**GCE Endpoint VMs (both modes):**

| VM | GCE Type | OS | Role |
|----|----------|-----|------|
| `soc-linux-ws-1` | `e2-small` | Ubuntu 22.04 | Workstation endpoint |
| `soc-linux-ws-2` | `e2-small` | Ubuntu 22.04 | Workstation endpoint |
| `soc-linux-sv-1` | `e2-small` | Ubuntu 22.04 | Server endpoint |

Each VM runs Elastic Agent (→ Fleet Server → ES) and Sandcat (→ Caldera). In local mode, Caldera runs in Docker on your machine and GCE VMs reach it via Tailscale or a GCP-to-local tunnel. In cloud mode, Caldera runs on a GCE VM in the same VPC.

#### Cloud Mode (Elastic Cloud + GCE)

| Component | Hosting | Purpose |
|-----------|---------|---------|
| Elasticsearch + Kibana | Elastic Cloud | Same as local, managed |
| Caldera + Bridge | GCE VM (`e2-medium`) | Bridge polls Elastic Cloud ES |
| Endpoint VMs | GCE VMs (`e2-small`) | Same VPC as Caldera VM |

### Telemetry Flow

```
Caldera executes technique on GCE endpoint VM
    → Elastic Defend captures:
        - Process events (logs-endpoint.events.process-*)
        - File events (logs-endpoint.events.file-*)
        - Network events (logs-endpoint.events.network-*)
        - Registry events (logs-endpoint.events.registry-*)
        - DNS events (logs-endpoint.events.dns-*)
    → Elastic Agent ships to Elasticsearch (local Docker or Elastic Cloud)
    → Detection rules evaluate (EQL, ES|QL, threshold, ML)
    → Alerts written to .alerts-security.alerts-default
    → Alert trigger fires Triage Workflow
    → Autonomous SOC pipeline begins
```

### Performance-Gated Escalating Difficulty

The attack emulation adapts to the SOC's competence. A Difficulty Controller workflow monitors SOC metrics and decides when to escalate.

#### Difficulty Levels

| Level | Name | Techniques | Example Campaign | Graduation Criteria |
|-------|------|-----------|-----------------|-------------------|
| 1 | **Script Kiddie** | Single-stage, noisy | Crypto miner, reverse shell, `whoami` | MTTD < 5min, automation rate > 80%, 5 consecutive auto-resolved |
| 2 | **Opportunistic** | 2-stage chains | Phishing → credential dump, exploit → crontab | MTTD < 10min, confidence accuracy > 75% |
| 3 | **Targeted** | Multi-stage with evasion | Spearphish → LOLBin → lateral movement → data staging | MTTD < 15min, Entity Agent correlates across hosts |
| 4 | **APT-lite** | Full kill chain with stealth | Supply chain → fileless → process injection → C2 → exfil | All agents exercised, Meta Agent tuned ≥ 3 rules |
| 5 | **Adversarial** | Novel + anti-forensics | Techniques with no detection rule coverage | Meta Agent successfully creates new specialist agent |

#### Difficulty Controller Workflow (scheduled every 5min)

```yaml
version: "1"
name: "SOC Difficulty Controller"
triggers:
  - type: scheduled
    with:
      every: "5m"
steps:
  - name: get_metrics
    type: elasticsearch.esql.query
    with:
      query: >
        FROM .soc-outcomes
        | WHERE @timestamp > NOW() - 30 MINUTES
        | STATS
            avg_mttd = AVG(time_to_detect),
            avg_mttr = AVG(time_to_respond),
            automation_rate = COUNT(disposition == "auto_resolved") / COUNT(*) * 100,
            avg_confidence_accuracy = AVG(confidence_accuracy)

  - name: get_current_level
    type: elasticsearch.search
    with:
      index: ".soc-difficulty-state"
      body:
        size: 1
        sort: [{ "@timestamp": "desc" }]

  - name: evaluate_graduation
    type: ai.agent
    agent-id: soc-difficulty-evaluator
    with:
      message: >
        Evaluate whether the SOC should graduate to the next difficulty level.
        Current difficulty: {{ steps.get_current_level.output.hits.hits.0._source.level }}
        Metrics (last 30min): MTTD={{ steps.get_metrics.output.values.0.avg_mttd }}s,
        automation_rate={{ steps.get_metrics.output.values.0.automation_rate }}%,
        confidence_accuracy={{ steps.get_metrics.output.values.0.avg_confidence_accuracy }}%
        Respond with JSON: { "decision": "escalate|hold|deescalate", "reasoning": "..." }
    timeout: 60s

  - name: compute_new_level
    type: data.set
    with:
      current_level: "{{ steps.get_current_level.output.hits.hits.0._source.level }}"
      decision: "{{ steps.evaluate_graduation.output.decision }}"

  - name: update_state
    type: elasticsearch.index
    with:
      index: ".soc-difficulty-state"
      body:
        level: >
          {%- if steps.evaluate_graduation.output.decision == "escalate" -%}
            {%- assign new_level = steps.get_current_level.output.hits.hits[0]._source.level | plus: 1 -%}
            {%- if new_level > 5 %}5{%- else %}{{ new_level }}{%- endif -%}
          {%- elsif steps.evaluate_graduation.output.decision == "deescalate" -%}
            {%- assign new_level = steps.get_current_level.output.hits.hits[0]._source.level | minus: 1 -%}
            {%- if new_level < 1 %}1{%- else %}{{ new_level }}{%- endif -%}
          {%- else -%}
            {{ steps.get_current_level.output.hits.hits[0]._source.level }}
          {%- endif -%}
        previous_level: "{{ steps.get_current_level.output.hits.hits.0._source.level }}"
        decision: "{{ steps.evaluate_graduation.output.decision }}"
        reasoning: "{{ steps.evaluate_graduation.output.reasoning }}"

  - name: launch_attacks
    type: elasticsearch.index
    with:
      index: ".soc-attack-commands"
      document:
        status: "pending"
        difficulty: "{{ steps.update_state.output._source.level }}"
        decision: "{{ steps.evaluate_graduation.output.decision }}"
        reasoning: "{{ steps.evaluate_graduation.output.reasoning }}"
        created_at: "{{ 'now' | date: '%Y-%m-%dT%H:%M:%SZ' }}"
```

#### Level 5 Adversarial Targeting

Level 5 is special: the Attack Launcher queries detection rule coverage, identifies ATT&CK techniques with no rules, and specifically targets those — forcing the Meta Agent to evolve or create specialist agents.

#### Caldera Profile Mapping

| Difficulty | Caldera Profile | ATT&CK Techniques |
|-----------|----------------|-------------------|
| 1 | `script-kiddie-profile` | T1059.004, T1496, T1033 |
| 2 | `opportunistic-profile` | T1566.001, T1003.008, T1053.003 |
| 3 | `targeted-profile` | T1204.002, T1218.011, T1021.004, T1074.001 |
| 4 | `apt-lite-profile` | T1195.002, T1055.012, T1071.004, T1041 |
| 5 | `adversarial-profile` | Random selection prioritizing uncovered techniques |

---

## 5. Agent Specifications

### Agent 1: Triage Agent

**Purpose:** First responder. Classifies every alert as TP/FP/Suspicious, assigns initial confidence score, decides pipeline path.

| Property | Value |
|----------|-------|
| **Agent ID** | `soc-triage-agent` |
| **Skills** | `alert-analysis` (existing), custom `soc-triage` |
| **Tools** | `security.alerts`, `security.entity_risk_score`, `platform.core.execute_esql`, `platform.core.sml_search`, `platform.core.sml_attach` |

**Skill instructions:**

```
You are the Triage Agent in an Autonomous SOC mesh.

## Input
You receive an alert from .alerts-security.alerts-* with full ECS fields.

## Process
1. Read SML for known patterns matching this alert's signature (rule name, process, host, user)
2. If SML contains a high-confidence match (prior FP/TP with same signature), reuse that classification with confidence boost
3. Otherwise, analyze the alert:
   - Fetch related alerts (same host, user, source IP within 30min window)
   - Check entity risk score for involved entities
   - Evaluate MITRE ATT&CK context from kibana.alert.rule.threat
   - Assess alert severity and risk score
4. Classify: TRUE_POSITIVE, FALSE_POSITIVE, or SUSPICIOUS
5. Assign confidence score (0-100) based on:
   - Alert severity weight (critical=+30, high=+20, medium=+10, low=+5)
   - Entity risk adjustment (critical entity=+15, high=+10, normal=+0)
   - Related alerts correlation (+5 per related alert, max +20)
   - SML pattern match adjustment (+/- 15)
6. Write learned pattern to SML if confidence > 80

## Output (structured)
{
  "correlation_id": "<alert_id>_<hop_1>",
  "hop_count": 1,
  "alert_ids": ["<original_alert_id>", "<related_alert_ids>"],
  "classification": "TRUE_POSITIVE|FALSE_POSITIVE|SUSPICIOUS",
  "confidence": 0-100,
  "reasoning": "<2-3 sentence explanation>",
  "entities": { "hosts": [], "users": [], "ips": [] },
  "mitre_techniques": ["T1059.004"],
  "enrichment_requests": ["entity_deep_dive", "behavioral_baseline"],
  "sml_patterns_matched": ["<pattern_ids>"]
}
```

**Triage Workflow:**

```yaml
version: "1"
name: "SOC Triage"
triggers:
  - type: alert
steps:
  - name: deduplicate
    type: elasticsearch.search
    with:
      index: ".soc-triage-results"
      body:
        query:
          bool:
            filter:
              - terms:
                  alert_ids: "{{ event.alerts | map: 'kibana.alert.uuid' }}"
              - range:
                  "@timestamp": { gte: "now-1h" }

  - name: check_duplicate
    type: if
    condition: "steps.deduplicate.output.hits.total.value > 0"
    steps:
      - name: skip
        type: console
        with:
          message: "Duplicate alert, skipping"
    else:
      - name: triage
        type: ai.agent
        agent-id: soc-triage-agent
        with:
          message: >
            Triage the following alert(s):
            {{ event.alerts | json }}
        timeout: 120s

      - name: store_result
        type: elasticsearch.index
        with:
          index: ".soc-triage-results"
          body: "{{ steps.triage.output | json }}"

      - name: audit
        type: elasticsearch.index
        with:
          index: ".soc-audit-trail"
          body:
            correlation_id: "{{ steps.triage.output.correlation_id }}"
            agent_name: "triage"
            action: "classified"
            confidence: "{{ steps.triage.output.confidence }}"
            classification: "{{ steps.triage.output.classification }}"

      - name: route
        type: switch
        expression: "{{ steps.triage.output.confidence }}"
        cases:
          - match: ">= 40"
            steps:
              - name: enrich
                type: workflow.executeAsync
                with:
                  workflow-id: "soc-enrichment"
                  inputs:
                    triage_result: "{{ steps.triage.output | json }}"
          - match: "< 40"
            steps:
              - name: auto_close
                type: kibana.SetAlertsStatus
                with:
                  alert_ids: "{{ steps.triage.output.alert_ids }}"
                  status: "closed"
              - name: log_outcome
                type: elasticsearch.index
                with:
                  index: ".soc-outcomes"
                  body:
                    correlation_id: "{{ steps.triage.output.correlation_id }}"
                    disposition: "auto_closed_fp"
                    confidence_history:
                      - agent: "triage"
                        confidence: "{{ steps.triage.output.confidence }}"
                    time_to_resolve: "{{ steps.triage.output.processing_time_ms }}"

  on-failure:
    fallback:
      - name: dead_letter
        type: elasticsearch.index
        with:
          index: ".soc-dead-letter"
          body:
            source: "triage_workflow"
            alert_ids: "{{ event.alerts | map: 'kibana.alert.uuid' }}"
            error: "{{ error.message }}"
            retry_count: 0
```

---

### Agent 2: Entity Agent

**Purpose:** Enrichment specialist. Deep entity context — risk scores, behavioral baselines, relationships, anomalies.

| Property | Value |
|----------|-------|
| **Agent ID** | `soc-entity-agent` |
| **Skills** | `entity-analytics` (existing), custom `soc-entity-enrichment` |
| **Tools** | `security.entity_risk_score`, `security.get_entity`, `security.search_entities`, `platform.core.execute_esql`, `platform.core.sml_search`, `platform.core.sml_attach` |

**Skill instructions:**

```
You are the Entity Agent in an Autonomous SOC mesh.

## Input
Triage result with entities (hosts, users, IPs) and enrichment requests.

## Process
1. For each entity:
   a. Fetch risk score from Entity Store
   b. Query behavioral baseline (last 7d via ES|QL):
      - Hosts: typical processes, network connections, login patterns
      - Users: login hours, source IPs, accessed resources
      - IPs: reputation, geo, connection frequency
   c. Identify anomalies (deviations from baseline)
   d. Map relationships (user→hosts, host→users, IP→hosts)
2. Check SML for prior baselines (avoid re-computing known entities)
3. Calculate confidence adjustment:
   - Critical asset involved: +15
   - High risk score (>70): +10
   - Behavioral anomaly detected: +10
   - Known benign pattern from SML: -10
4. Write updated baselines to SML

## Output (structured)
{
  "correlation_id": "<inherited>",
  "hop_count": "<inherited + 1>",
  "confidence": "<triage_confidence + adjustment>",
  "confidence_delta": "<adjustment>",
  "entities_enriched": [{
    "entity_id": "host:linux-ws-1",
    "risk_score": 75,
    "asset_criticality": "high",
    "behavioral_anomalies": ["unusual_process: /tmp/beacon", "new_outbound_ip: 203.0.113.42"],
    "relationships": ["user:jsmith", "user:admin"],
    "baseline_summary": "..."
  }],
  "enrichment_summary": "<2-3 sentences for Case Agent>"
}
```

---

### Agent 3: Hunt Agent

**Purpose:** Deep investigator. Conducts structured threat hunts when triage confidence is ambiguous (40–69).

| Property | Value |
|----------|-------|
| **Agent ID** | `soc-hunt-agent` |
| **Skills** | `threat-hunting` (existing), custom `soc-investigation` |
| **Tools** | `security.alerts`, `platform.core.execute_esql`, `platform.core.generate_esql`, `security.attack_discovery_search`, `security.security_labs_search`, `platform.core.sml_search`, `platform.core.sml_attach` |

**Skill instructions:**

```
You are the Hunt Agent in an Autonomous SOC mesh.

## Input
Triage + Entity enrichment results with confidence 40-69 (ambiguous).

## Process
1. Read SML for investigation patterns that matched similar scenarios
2. Formulate 2-3 threat hypotheses based on MITRE techniques and entities
3. For each hypothesis, execute ES|QL queries:
   - Process tree analysis (parent/child chain)
   - Network timeline (connections 30min before/after)
   - File activity correlation (drops, modifications, deletions)
   - Lateral movement indicators (SMB, SSH, RDP to other hosts)
4. Check Attack Discovery for correlated attack chains
5. Search Security Labs for threat intelligence on observed IOCs
6. Evaluate evidence:
   - Corroborating evidence → confidence += 15-25
   - Exculpatory evidence → confidence -= 15-25
   - Inconclusive → confidence unchanged
7. Write successful investigation patterns to SML

## Output (structured)
{
  "correlation_id": "<inherited>",
  "hop_count": "<inherited + 1>",
  "confidence": "<updated>",
  "confidence_delta": "<total adjustment>",
  "hypotheses_tested": [{
    "hypothesis": "Lateral movement via SSH following credential dump",
    "queries_executed": ["FROM logs-endpoint.events.network-* ..."],
    "evidence": ["SSH to linux-sv-1 at 14:32, 3min after mimikatz"],
    "verdict": "CORROBORATED"
  }],
  "iocs_discovered": ["203.0.113.42", "/tmp/.beacon"],
  "related_alerts_found": ["<alert_ids>"],
  "investigation_summary": "<paragraph for Case Agent>"
}
```

---

### Agent 4: Response Agent (Deterministic Workflow — No LLM)

**Purpose:** Executes containment and response actions. Deliberately deterministic — no AI reasoning for response actions. Confidence threshold determines actions; the workflow executes reliably.

**No Agent Builder agent.** Pure workflow with deterministic steps.

**Design rationale:** LLMs should never decide _whether_ to isolate a host or construct the API call. Making response deterministic means: (1) auditable, (2) fast — no LLM latency on time-critical containment, (3) safe — no hallucinated response actions.

**Response Workflow:**

```yaml
version: "1"
name: "SOC Response"
steps:
  - name: validate_confidence
    type: if
    condition: "inputs.confidence >= 70"
    steps:
      - name: acknowledge_alerts
        type: kibana.SetAlertsStatus
        with:
          alert_ids: "{{ inputs.alert_ids }}"
          status: "acknowledged"

      - name: high_confidence_response
        type: if
        condition: "inputs.confidence >= 90"
        steps:
          - name: isolate_host
            type: kibana.request
            with:
              method: POST
              path: "/api/endpoint/action/isolate"
              body:
                endpoint_ids: "{{ inputs.entities.hosts | map: 'endpoint_id' }}"
                comment: "Auto-isolated by SOC mesh. Correlation: {{ inputs.correlation_id }}"

          - name: kill_suspicious_process
            type: if
            condition: "inputs.suspicious_pids | size > 0"
            steps:
              - name: kill
                type: kibana.request
                with:
                  method: POST
                  path: "/api/endpoint/action/kill_process"
                  body:
                    endpoint_ids: "{{ inputs.entities.hosts | map: 'endpoint_id' }}"
                    parameters:
                      pid: "{{ inputs.suspicious_pids.0 }}"

      - name: log_response
        type: elasticsearch.index
        with:
          index: ".soc-response-actions"
          body:
            correlation_id: "{{ inputs.correlation_id }}"
            confidence_at_response: "{{ inputs.confidence }}"

      - name: audit
        type: elasticsearch.index
        with:
          index: ".soc-audit-trail"
          body:
            correlation_id: "{{ inputs.correlation_id }}"
            agent_name: "response"
            action: "containment_executed"
            confidence: "{{ inputs.confidence }}"

      - name: to_case
        type: workflow.executeAsync
        with:
          workflow-id: "soc-case-creation"
          inputs: "{{ inputs | json }}"

  on-failure:
    fallback:
      - name: dead_letter
        type: elasticsearch.index
        with:
          index: ".soc-dead-letter"
          body:
            source: "response_workflow"
            error: "{{ error.message }}"
            correlation_id: "{{ inputs.correlation_id }}"
```

---

### Agent 5: Case Agent

**Purpose:** Assembles full evidence chain into a Kibana case with structured timeline, AI-generated summary, and all artifacts attached.

| Property | Value |
|----------|-------|
| **Agent ID** | `soc-case-agent` |
| **Skills** | Custom `soc-case-management` |
| **Tools** | `platform.core.cases`, `platform.core.execute_esql`, `platform.core.sml_search`, `platform.core.sml_attach` |

**Skill instructions:**

```
You are the Case Agent in an Autonomous SOC mesh.

## Input
Full pipeline context: triage, entity enrichment, hunt findings, response actions.

## Process
1. Check SML for similar past cases
2. Generate case title: "[Auto] {MITRE Technique} on {primary host} — {classification}"
3. Generate structured case description:
   - Attack Summary: 2-3 sentences
   - Timeline: Chronological events from first alert to response
   - Entities Involved: Hosts, users, IPs with risk scores
   - Evidence: Key log entries, process trees, connections
   - MITRE Mapping: Techniques with confidence
   - Response Actions: What was done and outcome
   - Confidence History: Score evolution through pipeline
4. Create case with severity from confidence (≥90=critical, 70-89=high, 40-69=medium)
5. Attach original alerts
6. Write outcome to .soc-outcomes

## Output
{
  "correlation_id": "<inherited>",
  "case_id": "<created>",
  "disposition": "auto_resolved|escalated|investigation_complete",
  "confidence_history": [...],
  "time_to_detect": "<ms>",
  "time_to_respond": "<ms>",
  "agents_involved": ["triage", "entity", "hunt", "response", "case"],
  "techniques_observed": ["T1059.004", "T1021.004"]
}
```

---

### Agent 6: Detection Engineering Agent

**Purpose:** Feedback loop. Analyzes triage outcomes over time and autonomously tunes detection rules.

| Property | Value |
|----------|-------|
| **Agent ID** | `soc-deteng-agent` |
| **Skills** | `detection-rule-edit` (existing), custom `soc-detection-engineering` |
| **Tools** | `security.create_detection_rule`, `security.alerts`, `platform.core.execute_esql`, `platform.core.generate_esql`, `platform.core.sml_search`, `platform.core.sml_attach` |

**Tuning decision matrix:**

| Signal | Action | Threshold |
|--------|--------|-----------|
| FP rate > 50% | Add exception or raise threshold | ≥ 10 alerts in 24h |
| FP rate > 80% | Disable rule, flag for Meta Agent | ≥ 20 alerts |
| Technique in hunts with no rule | Create new detection rule | ≥ 2 occurrences |
| Rule never fires in 7 days | Review query | Checked weekly |
| Same FP across multiple rules | Environment-wide exception list | ≥ 3 rules affected |

**Safety guardrails (autonomous but safe):**
- Auto-generated rules tagged `auto-generated: true`
- New rules created as `disabled`, enabled after 15-minute preview confirms no excessive FPs
- Maximum 5 rule changes per 30-minute cycle
- All changes logged to `.soc-evolution-log` with before/after diffs

**DetEng Workflow (scheduled every 30min).**

---

### Agent 7: Watchdog Agent

**Purpose:** Monitors health and performance of the agent mesh. Detects degraded agents, stalled pipelines, coverage gaps.

| Property | Value |
|----------|-------|
| **Agent ID** | `soc-watchdog-agent` |
| **Skills** | Custom `soc-watchdog` |
| **Tools** | `platform.core.execute_esql`, `platform.core.sml_search`, `platform.core.sml_attach` |

**Detection thresholds:**
- Throughput = 0 for > 10min → `STALLED`
- Average latency > 60s → `DEGRADED`
- Dead-letter items > 10 unresolved → `FAILING`
- Alerts with no triage result within 5min → `PIPELINE_GAP`
- Techniques with final confidence < 40 (not FP) → `COVERAGE_GAP`

**Watchdog Workflow (scheduled every 5min).**

---

### Agent 8: Meta Agent

**Purpose:** The brain of the mesh. Analyzes system-wide performance, tunes the agent ecosystem, and creates new specialist agents when coverage gaps are detected.

| Property | Value |
|----------|-------|
| **Agent ID** | `soc-meta-agent` |
| **Skills** | Custom `soc-evolution`, `detection-rule-edit` (existing) |
| **Tools** | `platform.core.execute_esql`, `platform.core.sml_search`, `platform.core.sml_attach`, `security.create_detection_rule`, Kibana API via `kibana.request` for Agent Builder CRUD |

**Three evolution actions:**

1. **Skill Refinement** — When an agent underperforms, rewrite its instructions via `PUT /api/agent_builder/agents/{id}`
2. **Agent Creation** — When coverage gaps persist, spawn specialist agents via `POST /api/agent_builder/agents` + create invocation workflow via `POST /api/workflows`
3. **Agent Retirement** — When specialists are no longer needed (technique covered by improved rules + triage), disable workflow and archive agent

**Rate limits:**
- Max 2 agent creations per 15-minute cycle
- Max 5 rule changes per 30-minute cycle
- Convergence tracking: if accuracy oscillates, pause refinement for 1 hour

**Meta Agent Workflow (scheduled every 15min).**

---

## 6. Self-Improvement & Evolution

### Three Interconnected Feedback Loops

#### Loop 1: Knowledge Accumulation (Continuous)

**Timescale:** Real-time, after every pipeline execution.
**Mechanism:** SML (Semantic Memory Layer).

```
Alert processed → Agent writes learned pattern to SML → Next alert benefits
```

**SML write contract:**

| Agent | Writes | Example |
|-------|--------|---------|
| Triage | FP/TP signatures | "svchost.exe from C:\Temp = FP (legitimate updater)" |
| Entity | Behavioral baselines | "user:jsmith typical login 08:00-18:00 UTC" |
| Hunt | Investigation patterns | "Lateral movement via PsExec: check parent chain + SMB within 5min" |
| DetEng | Rule tuning rationale | "Rule X threshold 3→5: build servers trigger 4/hour" |
| Meta | Evolution rationale | "Created ransomware specialist: 12 low-confidence alerts in 24h" |

**SML lifecycle:**
- `usage_count > 5` AND `accuracy_score > 0.9` → promoted to "proven" (90-day expiry)
- `accuracy_score < 0.5` after 3+ uses → auto-invalidated as "harmful pattern"
- Unused 30 days → expired and pruned
- Meta Agent consolidates similar entries into generalized patterns

#### Loop 2: Detection Tuning (Every 30 minutes)

**Timescale:** Batched.
**Mechanism:** DetEng Agent analyzes accumulated outcomes.

```
Outcomes accumulate → DetEng analyzes → Rules tuned → Better alerts → Better outcomes
```

#### Loop 3: Agent Evolution (Every 15 minutes)

**Timescale:** Batched.
**Mechanism:** Meta Agent analyzes system-wide performance and coverage.

**Agent lifecycle state machine:**

```
CANDIDATE (just created) → accuracy > 60% after 1h → ACTIVE
ACTIVE → accuracy < 60% → DEGRADED (Meta Agent refines)
DEGRADED → accuracy recovers → ACTIVE
ACTIVE/DEGRADED → accuracy < 40% → RETIRED (workflow disabled)
ACTIVE → unused > 7 days → RETIRED
RETIRED → 30 days → ARCHIVED (definition deleted, SML entries kept)
```

### Adversarial Training Dynamic

All three loops connect to attack emulation:

```
Attack Emulation (Level N) generates technique
    → SOC pipeline processes it
    → Outcome feeds Loop 1 (knowledge), Loop 2 (detection), Loop 3 (evolution)
    → Difficulty Controller checks: SOC competent at Level N?
        → Yes: escalate to Level N+1
        → No: hold or de-escalate
    → Level 5 targets uncovered techniques → forces Meta Agent to evolve
    → Cycle repeats
```

### Convergence Safeguards

- Max 2 agent creations per 15-minute cycle
- Max 5 rule changes per 30-minute cycle
- If accuracy oscillates (improve → degrade → improve), pause refinement for 1 hour
- All changes reversible: previous versions stored in `.soc-evolution-log`
- Auto-generated rules can be bulk-reverted via tag filter

---

## 7. SOC Metrics & Dashboard-as-Code

### Repository Structure

```
soc-simulation/
  docker-compose.yml          # Full local stack (ES, Kibana, Fleet, Caldera, Bridge)
  .env.example                # Port config, credentials template
  .env.cloud.example          # Cloud deployment config template
  setup.sh                    # Deploy all artifacts to any Kibana/ES via REST APIs
  teardown.sh                 # Reverse of setup.sh — clean removal

  setup/
    index_templates/          # ES index templates (12 indices, incl .soc-attack-commands)
    ilm_policies/             # ILM: soc-default (90d), soc-audit-permanent
    data_views/               # Kibana data views (5 NDJSON files)
    dashboards/               # Kibana dashboards (3 NDJSON files)
    seed_data/                # Initial .soc-difficulty-state (level=1)

  agents/                     # Agent Builder definitions (8 JSON files, incl difficulty-evaluator)
  workflows/                  # Workflow YAML definitions (~12 files)
  detection_rules/            # Baseline detection rules (NDJSON)

  caldera_profiles/           # Caldera adversary profiles (5 JSON files)
  bridge/
    caldera_bridge.py         # Polling agent: ES → Caldera API
    requirements.txt          # elasticsearch, requests
    Dockerfile                # soc-caldera-bridge container

  infra/
    caldera/
      Dockerfile              # Caldera + Cortado custom image
      entrypoint.sh           # Caldera startup
      conf/                   # Caldera config (local.yml)
    gce/
      caldera_vm_setup.sh     # GCE VM provisioning for Caldera (cloud mode)
      endpoint_vm_setup.sh    # GCE endpoint VM provisioning (both modes)
      teardown_vms.sh         # Destroy GCE VMs
```

### Caldera Bridge

The bridge decouples the workflow engine from Caldera's network location. It's a Python container that polls Elasticsearch for attack commands and translates them into Caldera API calls.

#### Architecture

```
Workflow Engine (inside Kibana)          Caldera Bridge Container        Caldera Container
─────────────────────────────           ─────────────────────────       ──────────────────
Difficulty Controller Workflow           caldera_bridge.py               Caldera API :8888
  │                                       │                               │
  │ elasticsearch.index                   │ polls every 30s               │
  ├──→ .soc-attack-commands ──────────────┤                               │
  │    { status: "pending",               │ finds pending command         │
  │      difficulty: 3,                   │ updates status: "running"     │
  │      profile: "targeted" }            │                               │
  │                                       │ POST /api/v2/operations ──────┤
  │                                       │   { adversary_id, group }     │
  │                                       │                               │
  │                                       │ polls operation status        │
  │                                       │ until complete                │
  │                                       │                               │
  │                                       │ updates .soc-attack-commands: │
  │                                       │   { status: "completed",      │
  │                                       │     operation_id: "...",      │
  │                                       │     techniques_executed: [] } │
  │                                       │                               │
  │    .soc-attack-commands ──────────────┤                               │
  │    { status: "completed" }            │                               │
```

#### Bridge Behavior

1. **Poll cycle**: Query `.soc-attack-commands` for `status: "pending"` every 30 seconds
2. **Claim**: Atomically update `status: "pending"` → `"running"` (optimistic concurrency via `_seq_no`/`_primary_term`)
3. **Profile mapping**: Map `difficulty` level to Caldera adversary profile ID from `caldera_profiles/`
4. **Execute**: Create Caldera operation via REST API, targeting the `all-endpoints` group
5. **Monitor**: Poll Caldera operation status every 15s until `finished` or `timeout` (10min)
6. **Report**: Update `.soc-attack-commands` document with `status: "completed"`, `operation_id`, `techniques_executed[]`
7. **Failure**: On Caldera API error or timeout, update `status: "failed"` with error detail

#### .soc-attack-commands Index Schema

| Field | Type | Description |
|-------|------|-------------|
| `status` | keyword | `pending` → `running` → `completed` / `failed` |
| `difficulty` | integer | 1–5 |
| `profile` | keyword | Caldera adversary profile name |
| `techniques` | keyword[] | Specific ATT&CK technique IDs (for Level 5 targeting) |
| `correlation_id` | keyword | Unique command ID |
| `created_at` | date | When the workflow wrote the command |
| `claimed_at` | date | When bridge picked it up |
| `completed_at` | date | When attack finished |
| `operation_id` | keyword | Caldera operation ID (set by bridge) |
| `techniques_executed` | keyword[] | Techniques actually run (set by bridge) |
| `error` | text | Error message if failed |

### Portability: setup.sh / teardown.sh

Both scripts read configuration from `.env` (or `.env.cloud`) and use `curl` to hit Kibana/ES REST APIs. No Kibana CLI or SDK required.

#### setup.sh flow

```bash
#!/usr/bin/env bash
# Usage: ./setup.sh [--env .env.cloud]
# Reads: ES_URL, KIBANA_URL, ES_USER, ES_PASS from .env

# 1. Index templates
for f in setup/index_templates/*.json; do
  curl -X PUT "$ES_URL/_index_template/$(basename $f .json)" -d @$f
done

# 2. ILM policies
for f in setup/ilm_policies/*.json; do
  curl -X PUT "$ES_URL/_ilm/policy/$(basename $f .json)" -d @$f
done

# 3. Agents (Agent Builder API)
for f in agents/*.json; do
  curl -X POST "$KIBANA_URL/api/agent_builder/agents" -d @$f
done

# 4. Workflows (bulk create)
# Reads each .yaml, assembles into bulk payload
curl -X POST "$KIBANA_URL/api/workflows?overwrite=true" -d "$bulk_payload"

# 5. Dashboards + data views (saved objects import)
for f in setup/dashboards/*.ndjson setup/data_views/*.ndjson; do
  curl -X POST "$KIBANA_URL/api/saved_objects/_import?overwrite=true" --form file=@$f
done

# 6. Detection rules
curl -X POST "$KIBANA_URL/api/detection_engine/rules/_import?overwrite=true" --form file=@detection_rules/rules.ndjson

# 7. Seed data
for f in setup/seed_data/*.json; do
  curl -X POST "$ES_URL/$(jq -r .index $f)/_doc" -d "$(jq .body $f)"
done
```

#### teardown.sh flow

Reverse order: delete detection rules (by tag `soc-simulation`), delete workflows, delete agents, delete saved objects, delete indices, delete ILM policies, delete index templates.

### Dashboard: Autonomous SOC Command Center

**12 Lens visualizations across 5 panels, 15-second auto-refresh.**

#### Panel 1: Real-Time Pipeline

| Viz ID | Type | ES|QL Query |
|--------|------|-------------|
| `soc-metric-mttd` | Metric | `FROM .soc-outcomes-* \| WHERE @timestamp > NOW() - 30 MINUTES \| STATS avg_mttd = AVG(time_to_detect)` |
| `soc-metric-mttr` | Metric | `FROM .soc-outcomes-* \| WHERE @timestamp > NOW() - 30 MINUTES \| STATS avg_mttr = AVG(time_to_respond)` |
| `soc-metric-automation-rate` | Metric | `FROM .soc-outcomes-* \| WHERE @timestamp > NOW() - 30 MINUTES \| STATS rate = COUNT(disposition == "auto_resolved") / COUNT(*) * 100` |
| `soc-metric-alerts-per-min` | Metric + sparkline | `FROM .alerts-security.alerts-* \| WHERE @timestamp > NOW() - 5 MINUTES \| STATS count = COUNT(*) BY bucket = DATE_TRUNC(1 minute, @timestamp)` |
| `soc-pipeline-throughput` | Area (stacked) | `FROM .soc-audit-trail-* \| WHERE @timestamp > NOW() - 1 HOUR \| STATS count = COUNT(*) BY agent_name, bucket = DATE_TRUNC(1 minute, @timestamp)` |

#### Panel 2: Confidence Distribution

| Viz ID | Type | ES|QL Query |
|--------|------|-------------|
| `soc-confidence-histogram` | Histogram | `FROM .soc-outcomes-* \| WHERE @timestamp > NOW() - 1 HOUR \| STATS count = COUNT(*) BY confidence_bucket = FLOOR(confidence / 10) * 10` |
| `soc-confidence-by-technique` | Heatmap | `FROM .soc-outcomes-* \| WHERE @timestamp > NOW() - 4 HOURS \| STATS avg_conf = AVG(confidence) BY techniques_observed` |

#### Panel 3: Agent Mesh Health

| Viz ID | Type | ES|QL Query |
|--------|------|-------------|
| `soc-agent-status-table` | Table | `FROM .soc-agent-health-* \| STATS throughput = LAST(throughput), latency = LAST(latency_p50), errors = LAST(error_rate), status = LAST(status) BY agent_id` |
| `soc-agent-population` | Area | `FROM .soc-evolution-log-* \| WHERE action_type IN ("agent_create", "agent_retire") \| STATS creates = COUNT(action_type == "agent_create") BY bucket = DATE_TRUNC(15 minutes, @timestamp)` |

#### Panel 4: Evolution Activity

| Viz ID | Type | ES|QL Query |
|--------|------|-------------|
| `soc-evolution-timeline` | Event chart | `FROM .soc-evolution-log-* \| SORT @timestamp DESC \| KEEP @timestamp, action_type, agent_id, reasoning \| LIMIT 50` |
| `soc-fp-rate-trend` | Line | `FROM .soc-outcomes-* \| STATS fp_rate = COUNT(disposition == "auto_closed_fp") / COUNT(*) * 100 BY bucket = DATE_TRUNC(15 minutes, @timestamp)` |

#### Panel 5: Attack Difficulty

| Viz ID | Type | ES|QL Query |
|--------|------|-------------|
| `soc-difficulty-gauge` | Gauge | `FROM .soc-difficulty-state-* \| SORT @timestamp DESC \| KEEP level, level_name \| LIMIT 1` |

### Supplementary Dashboards

- **Case Evidence Explorer** — Kibana Cases list filtered to auto-generated cases
- **Evolution Audit Log** — Full `.soc-evolution-log` table with expandable rows, before/after diffs

### Setup Workflow

Single workflow deploys the entire simulation:
1. Create ILM policies (soc-default, soc-audit-permanent)
2. Create 11 index templates with data stream mappings
3. Import saved objects (data views + dashboards) via `/api/saved_objects/_import`
4. Create 7 agents via Agent Builder API
5. Create 11 workflows via Workflows API
6. Import baseline detection rules
7. Seed initial difficulty state (Level 1)
8. Verify deployment

### Teardown Workflow

Clean removal: disable workflows → delete agents → delete indices → remove dashboards.

### ILM Policies

| Policy | Hot | Warm | Cold | Delete |
|--------|-----|------|------|--------|
| `soc-default` | 7d (rollover 50GB) | 7d (shrink, forcemerge) | 30d | 90d |
| `soc-audit-permanent` | 30d (rollover 50GB) | 30d (shrink) | — | Never |

---

## 8. Demo Narrative

### Timeline

**Minute 0–5: "The SOC is alive"**
- Panel 1: alerts flowing in, pipeline processing autonomously
- Panel 3: all agents green, mesh healthy
- Panel 5: difficulty Level 1 (Script Kiddie)

**Minute 5–10: "Watch it learn"**
- Panel 4: DetEng Agent tuning a high-FP rule
- Panel 2: confidence histogram shifting rightward
- FP rate trend declining

**Minute 10–15: "Escalation"**
- Panel 5: difficulty escalates to Level 2, then 3
- Panel 2: new low-confidence cells appear (unknown techniques)

**Minute 15–20: "Self-evolution"**
- Panel 4: Meta Agent creates specialist agent
- Panel 3: agent count increases
- Low-confidence cells turn to high-confidence

**Minute 20–25: "The feedback loop"**
- Panel 4: FP rate continuing to decline
- Panel 5: difficulty keeps escalating, SOC keeps pace
- Panel 1: MTTD and MTTR trending down

---

## 9. Scaling Path

| Phase | Environment | Endpoints | Scale |
|-------|------------|-----------|-------|
| **Local Dev** | Docker Compose (9.4.0-SNAPSHOT) + 3 GCE VMs | 3 Linux + Caldera | ~10-30 alerts/hour |
| **Cloud Demo** | Elastic Cloud + 4+ GCE VMs | 3 Linux + 1 Windows + Caldera + Bridge | ~50 alerts/hour |
| **Cloud Production** | Elastic Cloud + 8+ GCE VMs | Linux/Windows/macOS + Caldera + Bridge | ~100+ alerts/hour |

Scaling is configuration-only: add more VMs, increase Caldera concurrency, same `setup.sh`/artifacts/dashboards. The Caldera Bridge handles increased attack volume without changes (stateless poller).

---

## 10. Success Criteria

- [ ] Docker Compose local stack running on non-default ports (19200/15601/18220/18888)
- [ ] Portable artifacts: `setup.sh` deploys to any Kibana/ES; `teardown.sh` removes cleanly
- [ ] Caldera Bridge polling `.soc-attack-commands` and executing attacks via Caldera API
- [ ] Continuous telemetry generation from real endpoints via attack emulation
- [ ] Full autonomous pipeline: detection → triage → enrichment → hunt → response → case
- [ ] All 7 AI agents + 1 response workflow operational, communicating via workflow.executeAsync
- [ ] SML shared brain populated and used by all agents
- [ ] Confidence-gated routing working (auto-close FPs, auto-respond to TPs)
- [ ] Detection Engineering feedback loop tuning rules autonomously
- [ ] Meta Agent creating specialist agents for coverage gaps
- [ ] Performance-gated difficulty escalation working through all 5 levels
- [ ] Level 5 adversarial targeting forcing system evolution
- [ ] Dashboard-as-code deployed via setup workflow, showing all metrics
- [ ] Dead letter recovery handling failures without data loss
- [ ] Full audit trail in .soc-audit-trail for every pipeline execution
- [ ] End-to-end demo completable in 25 minutes
- [ ] Teardown workflow cleanly removes everything
