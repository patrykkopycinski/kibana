# Workflows connector — detection rules and `soc_alert_sweeper`

This note describes how to attach Kibana’s **Workflows** system connector (action type `.workflows`) to Elastic Security detection rules so that **`soc_alert_sweeper`** runs when alerts are created, in addition to the workflow’s scheduled fallback.

## 1. Create the connector

The connector type id is **`.workflows`**. Config and secrets are empty objects for the default system connector.

**HTTP**

`POST /api/actions/connector`

```json
{
  "name": "ARGUS SOC — Workflows",
  "connector_type_id": ".workflows",
  "config": {},
  "secrets": {}
}
```

Response includes `id` (UUID) — use that as `actions[].id` on the rule.

A helper script that performs this call and prints example params:

`soc-simulation/setup/setup_workflows_connector.sh`

Set `KIBANA_URL` and optionally `KIBANA_AUTH` (`user:password`) before running.

## 2. Action parameters shape

When adding the action to a detection rule, set `action_type_id` to **`.workflows`** and use params:

```json
{
  "subAction": "run",
  "subActionParams": {
    "workflowId": "soc_alert_sweeper",
    "summaryMode": true,
    "alertStates": {
      "new": true,
      "ongoing": true,
      "recovered": false
    }
  }
}
```

- **`workflowId`**: Must match the workflow id in `soc-simulation/workflows/_registry.json` / the deployed workflow (here: `soc_alert_sweeper`).
- **`summaryMode`**: Omit or set per operator preference; affects how run metadata is surfaced in the UI.
- **`alertStates`**: Limits which alert lifecycle states trigger the workflow.

## 3. Attach to a detection rule

1. Open **Security → Rules**, edit the rule.
2. Under **Actions**, add an action:
   - Connector: the `.workflows` connector created above.
   - Configure using the JSON params in section 2.

Alternatively, use the Detection Engine API (`PUT /api/detection_engine/rules/:id`) and merge a new entry into the rule’s `actions` array. The exact payload depends on rule revision and Kibana version; mirror an existing action block and swap `action_type_id`, `id` (connector UUID), and `params`.

## 4. How this relates to workflow YAML

`soc_alert_sweeper` declares:

- `triggers: [ type: alert, type: scheduled, type: manual ]`

The **alert** trigger fires when the alerting framework invokes the workflow (including via the `.workflows` connector on a detection rule). The **scheduled** trigger remains a safety net for missed or batched alerts.

## 5. Operational notes

- The connector is a **system** action type; some deployments expose it only when Workflows UI / feature flags are enabled.
- Ensure the workflow **`soc_argus_case_lifecycle`** is deployed if you rely on tier-2/3 case creation from the sweeper (sub-workflow invoked via `workflow.execute`).
- For recommendations that require explicit human approval tiers, see `soc_recommendation_applier` and the optional `details.approval_tier` / `argus.approval_tier` fields used with `waitForInput`.
