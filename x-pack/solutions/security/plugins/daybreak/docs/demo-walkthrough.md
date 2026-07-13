# Daybreak spike — demo walkthrough

**Updated:** 2026-07-13  
**Verified result:** 7/7 golden-dataset shape matches on EIS `anthropic-claude-5-sonnet`.

A scripted walkthrough for exercising the Daybreak alert-analysis worker end-to-end on the `daybreak-spike` worktree. Assumes you are on the `worker-m1max` host (or equivalent) where the EIS connectors and local ES stack are already configured.

## 1. Environment checklist

Before starting, verify:

- [ ] Elasticsearch is running on the expected host/port (e.g. `http://localhost:15000`).
- [ ] Kibana has a valid trial or Enterprise license (required for `inference` and `ai.agent` connectors).
- [ ] Preconfigured EIS connectors are present. The daybreak-spike dev server starts with `--xpack.actions.preconfigured` for EIS models (see `/tmp/run-daybreak-eis.sh`).
- [ ] No other Kibana instance is claiming the same Task Manager index (otherwise workflow tasks run on the wrong host and resolve `localhost:15001`). Stop `weekly-evals-matrix` or any other Kibana sharing the same `.kibana_task_manager` index before the demo.
- [ ] Fleet/Endpoint agents are only needed if you want to demo live host isolation; the alert-analysis worker golden scoring does not require them.

## 2. Start the Kibana dev server

```bash
cd /Users/mac/Projects/kibana.worktrees/daybreak-spike
/tmp/run-daybreak-eis.sh
```

The script starts Kibana on `http://localhost:5631` with:

- `--no-base-path`
- `--server.publicBaseUrl=http://localhost:5631`
- Preconfigured EIS inference connectors (Claude Sonnet, etc.)
- Daybreak experimental features enabled

Wait for Kibana to be healthy:

```bash
for i in {1..30}; do
  curl -s -o /dev/null -w '%{http_code}' http://localhost:5631/api/status | grep -q 200 && break
  sleep 5
done
```

## 3. Seed demo data

```bash
curl -u elastic:changeme -X POST \
  -H 'kbn-xsrf: true' -H 'Content-Type: application/json' \
  http://localhost:5631/api/daybreak/seed-demo \
  -d '{"confirm":true}'
```

This creates the demo watches, workflows, and golden alert examples. Re-running returns `409` once the data exists.

## 4. Run one alert-analysis worker

Pick a golden example row id, e.g. `daybreak-golden-mimikatz-lsass`, and execute the workflow:

```bash
curl -u elastic:changeme -X POST \
  -H 'kbn-xsrf: true' -H 'Content-Type: application/json' \
  http://localhost:5631/api/daybreak/workflows/demo-workflow-1/execute \
  -d '{"rowId":"daybreak-golden-mimikatz-lsass"}'
```

The response contains the `workflowExecutionId`. Poll the worker-eval-records endpoint; a new record should appear within ~15 seconds:

```bash
curl -u elastic:changeme http://localhost:5631/api/daybreak/worker-eval-records
```

## 5. Score the full golden dataset

Run the sequential scoring script:

```bash
source ~/.nvm/nvm.sh
cd /Users/mac/Projects/kibana.worktrees/daybreak-spike
node x-pack/solutions/security/plugins/daybreak/.ao/score_golden_sequential.mjs
```

The script executes the workflow once per golden example, polls for each workflow to complete, waits for the corresponding `WorkerEvaluationRecord`, and prints a per-row and overall shape-match score.

Current verified result (EIS `anthropic-claude-5-sonnet`, 2026-07-13):

```
Verdict match: 7/7 (100.0%)
Shape score: 7/7 (100.0%)
```

## 6. View the UI

Open Kibana in a browser:

```
http://localhost:5631/app/daybreak
```

Log in with `elastic` / `changeme` (or the configured credentials).

If the **Introducing AI Agent** modal appears on first login, close it or click **Use AI Agent** to continue to the Daybreak app.

Navigate to the **Watches** tab to see:

- The list of seeded watches (`demo-watch-floor`, `demo-watch-officer`, etc.).
- Select a watch to open the detail panel. The autonomy selector now shows the reconciled labels:
  - **Auto-run** → Drafts auto / Human-on-the-loop / Prepare
  - **Proposed diff** → Suggest only / Reads auto / Observe / Propose
  - **Approval required** → Acts · gated / Acts · trusted / Human-in-the-loop / Execute low-risk / Execute consequential
- Toggle a watch between **Active** and **Paused**, edit the surface or skill ids, and save changes.

Navigate to the **Performance** tab to see:

- Total proposals, pending decisions, active watches, enabled workflows.
- **Worker Evaluation** section: live eval-run count and shape-match pass rate, with per-record badges.
- Click a worker-eval record to open the flyout and compare `actual` vs `expected` shapes side-by-side.

Navigate to the **Activity** tab to see:

- Workflow executions from the `auditTrail`.
- Proposal status transitions from the `decisionHistory`.

Both tabs auto-refresh every 5 seconds via `refetchInterval` on the react-query hooks.

## 8. Dark Watch — emit a Significant Security Event (SSE)

From the **Investigations** tab, select an escalated investigation. Then emit an SSE via the API:

```bash
curl -u elastic:changeme -X POST \
  -H 'kbn-xsrf: true' -H 'Content-Type: application/json' \
  http://localhost:5631/api/daybreak/sse/from-investigation \
  -d '{"investigationId":"investigation-alert-lateral-movement-dmz"}'
```

Or emit an SSE directly from an escalated proposal:

```bash
curl -u elastic:changeme -X POST \
  -H 'kbn-xsrf: true' -H 'Content-Type: application/json' \
  http://localhost:5631/api/daybreak/sse/from-proposal \
  -d '{"proposalId":"demo-proposal-5"}'
```

The response returns the new `SignificantSecurityEventProperties` document with:
- A title derived from the source investigation or proposal.
- A `findingType` of `escalation_request` (other types: `hunt_finding`, `correlation`, `threat_match`, `coverage_gap`).
- Recommended actions with required autonomy levels.
- Source references back to the investigation and/or proposal.

Navigate to the **SSE** tab to see:

- The list of emitted SSEs (auto-refreshed every 5 seconds).
- Select an SSE to view its description, recommended actions, entities, and destinations.
- Click **Emit from investigation** or **Emit from proposal** to create an SSE from the latest escalated source.

This slice demonstrates the Watch Officer → Dark Watch handoff: an escalated investigation or proposal becomes a durable, reviewable Significant Security Event. Future work can add real Dark Watch hunt skills, SKI ingestion, and external destinations (SIEM, webhook, case).

## 7. Watch Officer — create an investigation

From the **Brief** tab, select a proposal whose status is **escalated** (e.g. `alert-lateral-movement-dmz`). Then create an investigation via the API:

```bash
curl -u elastic:changeme -X POST \
  -H 'kbn-xsrf: true' -H 'Content-Type: application/json' \
  http://localhost:5631/api/daybreak/investigations/from-proposal \
  -d '{"proposalId":"alert-lateral-movement-dmz"}'
```

The response returns the new `InvestigationProperties` document with:
- A title derived from the proposal.
- A primary hypothesis.
- A timeline starting at the proposal escalation.
- One contextual entity for the originating watch.
- Open questions for the Watch Officer.

Navigate to the **Investigations** tab to see:

- The list of investigations (auto-refreshed every 5 seconds).
- Select an investigation to view its hypotheses, timeline, entities, and open questions.
- Click **Create from latest escalated proposal** to open a new investigation from the most recently escalated proposal.

## 8. Watch Officer — enrich an investigation

Select an investigation in the **Investigations** tab and click **Enrich** to run the deterministic correlation route, or click **Run worker** to execute the dedicated investigation enrichment workflow through the workflow engine.

API equivalents:

```bash
# Deterministic enrich (correlate proposals sharing the same source watch)
curl -u elastic:changeme -X POST \
  -H 'kbn-xsrf: true' -H 'Content-Type: application/json' \
  http://localhost:5631/api/daybreak/investigations/investigation-alert-lateral-movement-dmz/enrich \
  -d '{}'

# Dedicated investigation enrichment worker
curl -u elastic:changeme -X POST \
  -H 'kbn-xsrf: true' -H 'Content-Type: application/json' \
  http://localhost:5631/api/daybreak/investigations/investigation-alert-lateral-movement-dmz/run \
  -d '{}'
```

The response from the `/run` endpoint returns a `workflowExecutionId`. The workflow performs Setup → Load → Enrich → Confirm and updates the investigation with:
- New timeline entries for each correlated proposal.
- Contextual entities derived from the shared watch.

Verify the update:

```bash
curl -u elastic:changeme \
  http://localhost:5631/api/daybreak/investigations/investigation-alert-lateral-movement-dmz
```

## 9. Dark Watch — emit a Significant Security Event (SSE)

From the **Investigations** tab, select an escalated investigation. Then emit an SSE via the API:

```bash
curl -u elastic:changeme -X POST \
  -H 'kbn-xsrf: true' -H 'Content-Type: application/json' \
  http://localhost:5631/api/daybreak/sse/from-investigation \
  -d '{"investigationId":"investigation-alert-lateral-movement-dmz"}'
```

Or emit an SSE directly from an escalated proposal:

```bash
curl -u elastic:changeme -X POST \
  -H 'kbn-xsrf: true' -H 'Content-Type: application/json' \
  http://localhost:5631/api/daybreak/sse/from-proposal \
  -d '{"proposalId":"demo-proposal-5"}'
```

The response returns the new `SignificantSecurityEventProperties` document with:
- A title derived from the source investigation or proposal.
- A `findingType` of `escalation_request` (other types: `hunt_finding`, `correlation`, `threat_match`, `coverage_gap`).
- Recommended actions with required autonomy levels.
- Source references back to the investigation and/or proposal.

Navigate to the **SSE** tab to see:

- The list of emitted SSEs (auto-refreshed every 5 seconds).
- Select an SSE to view its description, recommended actions, entities, and destinations.
- Click **Emit from investigation** or **Emit from proposal** to create an SSE from the latest escalated source.

This slice demonstrates the Watch Officer → Dark Watch handoff: an escalated investigation or proposal becomes a durable, reviewable Significant Security Event. Future work can add real Dark Watch hunt skills, SKI ingestion, and external destinations (SIEM, webhook, case).

## 10. Verify proposal transitions (optional)

From the UI, open a proposal and use the status controls to transition it (e.g. `new` → `approved`). The transition should succeed and the Activity feed should update on the next refresh. If a transition is blocked, the UI will show the `missingRequirements` returned by the server gate.

## 11. Cleanup / reset

To clear worker eval records and start fresh:

```bash
curl -u elastic:changeme -X DELETE \
  http://localhost:15000/.kibana-daybreak-worker-eval-records-000001
```

To re-seed demo data after deleting the Daybreak indices, restart the `seed-demo` call above.

## 12. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Workflow execute returns `404` or `HTTP 404` in the workflow status | Another Kibana instance is stealing Task Manager tasks. | Stop the conflicting Kibana instance (e.g. `pkill -9 -f weekly-evals-matrix`) and restart the daybreak-spike server. |
| `WorkerEvaluationRecord` never appears | The `daybreak-alert-analysis-agent` was not recreated after a Kibana restart. | Re-create the agent via the Agent Builder API or re-run `seed-demo`. |
| UI shows stale proposal after a re-run | Duplicate proposal documents with the same logical `id` exist in the proposals index. | Fixed by `ProposalClient` idempotency; if you see duplicates, delete the index and re-seed. |
| Sequential scorer times out on one row | EIS connector latency or Task Manager contention. | Retry the individual row; increase the timeout in `score_golden_sequential.mjs` if needed. |
| AI Agent intro modal blocks the Daybreak app | First-login onboarding modal. | Close the modal or click **Use AI Agent**; refresh `/app/daybreak` if necessary. |

To stop the dev server:

```bash
lsof -ti tcp:5631 | xargs kill
```
