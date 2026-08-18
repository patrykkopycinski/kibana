# Deep Watch Raw Log Corroboration Eval Suite

Evaluates the Raw Log Corroboration Worker — a Deep Watch Worker that takes an
investigation narrative built from alerts and pivots into raw telemetry to
either corroborate or identify gaps.

## Scenarios

1. **Full corroboration** — all narrative stages have matching raw telemetry
2. **Partial gap** — one stage has no raw telemetry (detection blind spot)
3. **No raw telemetry** — the entire narrative cannot be corroborated

## Ladder

- L0: Transition gate (workflow-driven, no router surface)
- L1: Schema conformance (worker output schema validation)
- L2: Deterministic quality (gap detection accuracy)
- L3: Composite pipeline (narrative to raw log query to corroboration report)
- L4: Durable outcome (report persisted to store)
