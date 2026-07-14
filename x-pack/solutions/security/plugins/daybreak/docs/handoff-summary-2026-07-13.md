# Watch Floor FPR — handoff summary (2026-07-13)

**Worktree:** `/Users/mac/Projects/kibana.worktrees/daybreak-spike`  
**Host:** `worker-m1max`  
**Kibana:** `http://localhost:5631` (EIS dev config)  
**Branch:** `daybreak-spike` (local only)

## Session deliverables

### Watch Officer enrichment (prior session)
- Investigation schema, storage, API, UI, enrichment worker
- Dark Watch SSE from proposal/investigation
- Live verification: enrich + investigation worker on `:5631`

### Endpoint Act phase (this session)
- Pulled and registered `endpoint-response-actions` + `endpoint-forensic-analysis` Agent Builder skills
- **Response action worker:** `response_action_worker.yaml` + `POST /api/daybreak/proposals/{id}/act/response` + timeline append on linked investigation
- **Forensic worker:** `forensic_worker.yaml` + `POST /api/daybreak/investigations/{id}/run-forensic` (workflow) and `POST /api/daybreak/investigations/{id}/forensic` (discover-telemetry act step)
- **Entity enrich upgrade:** investigation enrich now correlates proposals by shared **host/user** entities (`correlate_investigation_entities.ts`), with `sourceWatch` fallback; investigation builder seeds host/user entities from proposal text

## Verification status

| Check | Result |
|---|---|
| Typecheck (`daybreak` plugin) | Green |
| Unit tests (response + forensic + entity correlation) | Green |
| Eval gate (`daybreak_eval_gate.mjs`) | 7/7 nominal, 1/1 broken |
| Live `act/response` on `demo-proposal-1` | 200 — `endpoint_not_found` for unenrolled host (expected) |
| Live forensic discover on escalated investigation | Pending Kibana restart after this batch |

## Demo narrative now supported

```
Alert → Proposal → Approve → Response action (get_processes/isolate)
                → Escalate → Investigation → Enrich (host/user correlation)
                                          → Forensic (endpoint-forensic-analysis)
                                          → SSE
```

## Remaining gaps before next major area

| Item | Status | Notes |
|---|---|---|
| Case management integration | **not started** | Suggested next major area |
| External SSE destinations | **not started** | Suggested next major area |
| Enrolled Defend host for live response/forensic | **open** | Scout cell has no Fleet endpoint — structured degrade works |
| Shared Approval Gate (#17944) | **blocked** | Spike-local `gate.ts` only |
| Buildkite eval gate wiring | **deferred** | Local gate green |
| AD real 9.5 output shape | **partial** | Deadline 2026-07-31 |
| UI buttons for Act-phase workers | **closed** | `use_proposal_actions`, `approval_gate`, `investigations_console` wired — see `watch-floor-gap-status.md` |

## Key commands

```bash
# Eval gate
node x-pack/solutions/security/plugins/daybreak/scripts/daybreak_eval_gate.mjs

# Response action (approved proposal)
curl -u elastic:changeme -X POST http://localhost:5631/api/daybreak/proposals/demo-proposal-1/act/response \
  -H 'kbn-xsrf: true' -H 'Content-Type: application/json' \
  -d '{"action":"get_processes","hostName":"FIN-WS-04"}'

# Forensic worker (escalated investigation)
curl -u elastic:changeme -X POST http://localhost:5631/api/daybreak/investigations/investigation-demo-proposal-5/run-forensic \
  -H 'kbn-xsrf: true' -H 'Content-Type: application/json' \
  -d '{"hosts":["FIN-WS-09"],"timeWindowHours":72}'

# Entity enrich
curl -u elastic:changeme -X POST http://localhost:5631/api/daybreak/investigations/{id}/enrich \
  -H 'kbn-xsrf: true'
```

## Files touched (endpoint wiring batch)

- `server/workflow/response_action_worker.yaml`
- `server/workflow/run_response_action_worker.ts`
- `server/workflow/forensic_worker.yaml`
- `server/workflow/run_forensic_worker.ts`
- `server/workflow/execute_skill_bounded_tool.ts`
- `server/workflow/correlate_investigation_entities.ts`
- `server/http_routes/proposals_act_response.ts`
- `server/http_routes/investigations.ts`
- `server/common/schemas/investigation_builder.ts`
- `server/plugin.ts`
- `docs/watch-floor-gap-status.md`
