# Buildkite — Daybreak offline eval gate (Gap #8)

**Purpose:** Wire the existing local gate (`scripts/daybreak_eval_gate.mjs`) as a
required check on PRs touching the daybreak plugin — without blocking unrelated
Kibana CI.

**Status:** Pipeline file shipped at `.buildkite/pipelines/daybreak-eval-gate.yml` (not merged to monorepo BK). Spike validates locally via `ci_run_daybreak_gates.sh`.

---

## What the gate does

1. Runs `ci_run_daybreak_gates.sh` (alert-analysis eval, L4 round-trip, full MVP capability gate, schema export)
2. Writes `data/daybreak-alert-analysis-eval-report.json`
3. Exits **1** when `summary.gatePassed === false`

```bash
node x-pack/solutions/security/plugins/daybreak/scripts/daybreak_eval_gate.mjs
```

---

## Proposed Buildkite step (`.buildkite/pipelines/daybreak-eval-gate.yml` sketch)

```yaml
steps:
  - label: ":jest: Daybreak offline eval gate"
    command:
      - .buildkite/scripts/bootstrap.sh
      - node x-pack/solutions/security/plugins/daybreak/scripts/daybreak_eval_gate.mjs
    agents:
      queue: "default"
    timeout_in_minutes: 15
    artifact_paths:
      - "data/daybreak-alert-analysis-eval-report.json"
```

### Path filter (only when daybreak changes)

Add to monorepo pipeline trigger rules:

```yaml
# Run only when daybreak plugin or golden dataset changes
if: build.branch =~ /^daybreak-/ || build.message =~ /daybreak/i
changed_files:
  - "x-pack/solutions/security/plugins/daybreak/**"
```

For `fix/weekly-evals-matrix` long-lived branch: attach as optional non-blocking
step first; promote to required after 2 green weeks.

---

## Artifact contract

CI uploads `data/daybreak-alert-analysis-eval-report.json`. Consumers parse:

| Field | Gate |
|---|---|
| `schemaVersion` | `=== 2` |
| `summary.gatePassed` | `=== true` |
| `summary.nominalPassed` | `=== summary.nominalTotal` |
| `summary.brokenFailed` | `=== summary.brokenTotal` |
| `provenance.costBasis` | `self-hosted` for offline; live runs use separate artifact |

---

## Local parity (pre-push)

```bash
cd ~/Projects/kibana.worktrees/daybreak-spike
node x-pack/solutions/security/plugins/daybreak/scripts/daybreak_eval_gate.mjs
echo $?  # expect 0
```

---

## Open items

- [x] Pipeline YAML at `x-pack/solutions/security/plugins/daybreak/.buildkite/pipelines/daybreak-eval-gate.yml`
- [ ] Pick BK queue/agent that has `yarn kbn bootstrap` cache for security solution
- [ ] Decide blocking vs advisory on `daybreak-spike` vs `fix/weekly-evals-matrix`
- [ ] Upload report as BK artifact for E&T audit trail
