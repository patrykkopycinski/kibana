# Reference workflows (elastic/workflows → daybreak mapping)

**Source repo:** [elastic/workflows](https://github.com/elastic/workflows)  
**Copied:** 2026-07-13 from `main`  
**Purpose:** Annotated copies for the daybreak-spike Watch Floor — map upstream Workflow Engine patterns to the spike's **Setup → Guard → Enrich → Reason → Act** worker phases and Proposal/Approval Gate model.

These files are **reference only** — not registered in the daybreak plugin runtime. Install or import via Kibana Workflows only when experimenting outside the spike.

## Daybreak phase legend

| Phase | Spike meaning | Typical step types |
|-------|---------------|-------------------|
| **Setup** | Load config, accept trigger payload, fan-out scope | `kibana.request` `/internal/daybreak/config`, `foreach`, `alert` trigger |
| **Guard** | Fail-closed gates, idempotency, eligibility | `if`, 409-skip, proposal `status === approved`, offline eval gate |
| **Enrich** | Package evidence, correlate entities, TI lookup | `elasticsearch.search`, `elasticsearch.esql.query`, `/api/daybreak/alert-summary` |
| **Reason** | AI analysis → structured recommendation | `ai.agent`, Security AI Assistant `chat/complete` |
| **Act** | Consequential change (after gate in spike) | `/api/daybreak/proposals/from-worker-run`, `act/response`, exceptions, isolate API |
| **Confirm** | Post-action audit read-back | `response_action_worker` `confirm` step, timeline append |

**Spike divergence:** Upstream examples often skip **Guard** (no Proposal queue / Approval Gate). Daybreak inserts human gate between Reason and Act.

## Files

| File | Upstream path | Best for |
|------|---------------|----------|
| `ad-automated-triaging.yaml` | `examples/security/response/ad-automated-triaging.yaml` | AD → case → agent → isolate → Slack sequencing |

| `alert_analysis_worker_alert.yaml` | spike `server/workflow/` | Alert-triggered variant (`type: alert`); enrich via `event.alerts[0]._id` |
| `response_action_worker.yaml` (FP branches) | spike `server/workflow/` | Post-gate FP tag on dismiss/tune; isolate only on approve |
| `disable-noisy-endpoint-rules-from-esql.yaml` | `examples/security/detection/disable-noisy-endpoint-rules-from-esql.yaml` | Track A3 supervised auto-tuning (FP exception creation) |

## Step mapping — AD Automated Triaging

| Step | Upstream type | Daybreak phase | Spike equivalent / gap |
|------|---------------|----------------|------------------------|
| `triggers: alert` | alert | **Setup** | Gap: spike uses manual `POST /workflows/{id}/execute`; alert trigger TBD |
| `for_each_discovery` | foreach | **Setup** | One proposal per alert row (golden `rowId`) |
| `create_case` | cases.createCase | **Act** *(no gate)* | Spike: `buildInvestigationFromProposal` + Proposal queue, not direct Case |
| `foreach_alert_in_ad` | foreach | **Enrich** | Attach alert IDs to evidence package |
| `get_details` | elasticsearch.search | **Enrich** | `GET /api/daybreak/alert-summary?rowId=` |
| `add_to_case` | cases.addAlerts | **Enrich** | `evidenceRefs` on proposal / investigation |
| `triage_agent` | kibana.request (AI Assistant) | **Reason** | `reason` step: `ai.agent` + `daybreak-alert-analysis-agent` |
| `add_analysis_to_case` | cases.addComment | **Act** (audit) | Investigation `timeline` entry |
| `get_host_details` | console (placeholder) | **Enrich** | `correlate_investigation_entities.ts`, `resolveProposalHostName` |
| `ai_summary` | kibana.request (AI Assistant) | **Reason** | `proposal.recommendation` field |
| `isolate_host` | kibana.request `/api/endpoint/action/isolate` | **Act** | `POST .../act/response` + Approval Gate; stub via `DAYBREAK_STUB_ENDPOINT_ACTIONS` |
| `notify_team` | http (Slack) | **Act** | Not wired in spike (operator-gated outbound) |

## Step mapping — Disable Noisy Endpoint Rules

| Step | Upstream type | Daybreak phase | Spike equivalent / gap |
|------|---------------|----------------|------------------------|
| `triggers: manual / scheduled` | manual, scheduled | **Setup** | Watch schedule + autonomy tier (`auto-run` for safe tuning) |
| `run_esql` | elasticsearch.esql.query | **Enrich** | FPR noise detection; golden family `benign-vuln-scanner` / tuning class |
| `per_row_create_exception` | foreach | **Setup** | Fan-out per noisy rule version row |
| `get_exception` | kibana.request GET | **Guard** | Idempotent skip if exception exists (409) |
| `create_only_if_missing` | if | **Guard** | Fail-closed branch before write |
| `create_endpoint_exception` | kibana.request POST | **Act** | **Track A3 exemplar** — supervised auto after proposal approval |
| `log_summary` | console | **Confirm** | Worker eval record / timeline receipt |

## Related spike files

- `server/workflow/alert_analysis_worker.yaml` — canonical 5-phase FPR worker
- `server/workflow/response_action_worker.yaml` — Act phase for approved proposals
- `server/common/schemas/attack_discovery_adapter.ts` — AD → Proposal (replaces direct `create_case`)
- `docs/watch-floor-gap-status.md` — gap tracker
