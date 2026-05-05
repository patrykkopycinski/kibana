# `.soc-kill-switch` — schema v1

Source-of-truth Zod schema: `KillSwitchDocSchema` in
[`contracts.ts`](../../../../x-pack/solutions/security/plugins/security_solution/server/lib/argus/synthesis/contracts.ts).

## Purpose

Cluster-wide kill switch. The autonomous synthesis workflow reads the
**most-recent** document on every tick; when `autonomy_enabled = false`
the workflow halts before any synthesis or write.

## Required fields

| Field | Type | Notes |
| --- | --- | --- |
| `@timestamp` | ISO-8601 string | Sort key. Most recent doc wins. |
| `autonomy_enabled` | boolean | The actual switch. **Must be a boolean** — strings like `"yes"` or `"no"` are rejected by the contract because the workflow's gate compares against `true / false`. |

## Optional fields

| Field | Type | Notes |
| --- | --- | --- |
| `reason` | string | Operator note explaining the toggle. Surfaces in the kill-switch audit row. |
| `operator` | string | Email / username of the operator who flipped the switch. |

## Producers

- `argus.toggle_kill_switch` chat tool (the only sanctioned producer).
- Operator UI / direct ES write — discouraged, but a string `reason`
  + `operator` should be supplied if it happens.

## Consumers

- `soc-argus-synthesis-driver.yaml` workflow — reads the latest doc
  on every tick. The `kill_switch_gate` step short-circuits the rest of
  the workflow on `autonomy_enabled=false`.
- Kill-switch banner in the Autonomy dashboard.

## Drift history

No drift events to date.

## Versioning

v1. Future changes (e.g. per-namespace kill switches with a
`scope: { space_ids[], origins[] }` block) would be additive and not
require a version bump. A scope-aware kill switch will need
coordinated changes in the workflow gate logic and the chat tool, but
the on-disk shape can stay v1.
