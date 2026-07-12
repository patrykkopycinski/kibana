# Daybreak spike — demo walkthrough

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

Run the scoring script:

```bash
source ~/.nvm/nvm.sh
cd /Users/mac/Projects/kibana.worktrees/daybreak-spike
node x-pack/solutions/security/plugins/daybreak/.ao/score_golden_workflow.mjs
```

The script executes the workflow once per golden example, polls for the resulting `WorkerEvaluationRecord` documents, and prints a shape-match score.

## 6. View the UI

Open Kibana in a browser:

```
http://localhost:5631/app/daybreak
```

Log in with `elastic` / `changeme` (or the configured credentials).

Navigate to the **Performance** tab to see:

- Total proposals, pending decisions, active watches, enabled workflows.
- **Worker Evaluation** section: live eval-run count and shape-match pass rate, with per-record badges.

Navigate to the **Activity** tab to see:

- Workflow executions from the `auditTrail`.
- Proposal status transitions from the `decisionHistory`.

Both tabs auto-refresh every 5 seconds via `refetchInterval` on the react-query hooks.

## 7. Verify proposal transitions (optional)

From the UI, open a proposal and use the status controls to transition it (e.g. `new` → `approved`). The transition should succeed and the Activity feed should update on the next refresh. If a transition is blocked, the UI will show the `missingRequirements` returned by the server gate.

## 8. Cleanup / reset

To clear worker eval records and start fresh:

```bash
curl -u elastic:changeme -X DELETE \
  http://localhost:15000/.kibana-daybreak-worker-eval-records-000001
```

To re-seed demo data after deleting the Daybreak indices, restart the `seed-demo` call above.

To stop the dev server:

```bash
lsof -ti tcp:5631 | xargs kill
```
