# B4 — Detection-as-code (DaC) git-backed deployment

> Status: **partially resolved 2026-05-05** — pure-logic
> serializer + parser ship with full round-trip coverage (23 unit
> tests), index template + ingestion workflow + RFC ship; the
> out-of-cluster sidecar that actually opens PRs is the explicit
> follow-up.

## 1. The gap

Vision-doc §1.6.1 calls for a git-backed deployment path so detection
rules become committable, reviewable, round-trippable artifacts —
not just live state mutated in place via the Kibana detection-engine
API. Today every mutation goes through
`soc-recommendation-applier.yaml` / `soc-autonomous-applier.yaml`,
both of which call the Kibana API directly — there's no git
serialisation step, no PR review surface, and no way to reproduce
"what's in production" from a checked-out repo.

For an enterprise SOC with a change-management requirement, that's
disqualifying — auditors expect every detection rule change to land
through code review with a deterministic artifact representation.

## 2. What ships today

### 2.1 Pure-logic artifact module

[`lib/argus/dac/rule_artifact.ts`](../../../../x-pack/solutions/security/plugins/security_solution/server/lib/argus/dac/rule_artifact.ts).
Three exported functions:

- `toArtifact(rule, options?) → DacRuleArtifact` — serialise.
- `fromArtifact(raw) → RuleLikeInput` — parse + validate.
- `stringifyArtifact(artifact) → string` — deterministic JSON, sorted
  keys, 2-space indent, trailing newline (git-diff-friendly).

The envelope shape is modelled on Kubernetes CRDs for familiarity:

```yaml
apiVersion: argus.elastic.co/v1
kind: ARGUSDetectionRule
metadata:
  name: <rule_id>
  version: <rule_version>
  source: argus | manual | imported
  authored_by: <agent_id | analyst handle>
  authored_at: <ISO8601>
  labels:        # optional, sorted alphabetically
    tier: platinum
  annotations:   # optional, sorted alphabetically
    argus.io/origin: synthesis_driver
spec:
  name: <human name>
  description: <…>
  query: <ES Query DSL>
  gate_overrides:  # optional, B6 per-rule overrides
    max_fp_rate: 0.04
```

23 unit tests cover envelope shape, key ordering for deterministic
output, round-trip identity (`fromArtifact(toArtifact(rule))` equals
`rule`), JSON-stringification stability (`stringifyArtifact` produces
byte-identical output for byte-identical inputs), and rejection of
schema drift (unsupported `apiVersion`/`kind`, missing `metadata.name`,
non-object `spec.query`, non-object input).

### 2.2 Storage envelope: `.soc-dac-export-queue`

A new index template, `dynamic: false`. Each row is one rule artifact
pending export. Fields:

- `queue_id` (= `mutation_intent_id`, doc id, idempotent).
- `rule_id`, `rule_version`, `source`.
- `status`: `pending` / `pr_opened` / `pr_merged` / `pr_rejected`.
- `artifact`: the full envelope (object, `enabled: false` so it
  passes through verbatim without mapping noise).
- `artifact_json`: optional canonicalised JSON string the sidecar
  can byte-write directly to git.
- `git_status.{branch, pr_url, committed_at, merged_at}` — populated
  by the sidecar after the PR is opened.

Doc id = `mutation_intent_id` so re-runs are idempotent (the same
mutation never produces two queue rows).

### 2.3 Producer workflow

[`soc-argus-dac-export.yaml`](../../../workflows/soc-argus-dac-export.yaml).
Every 1h + manual. Queries `.soc-mutation-intents` for
`status: applied`, `kind: rule_create`, `argus.origin:
synthesis_driver`, `@timestamp >= now-24h`, and not already exported
(`argus.dac_exported_at` field absent). Fans out one queue row per
rule.

The Liquid template emits a conservative envelope shape. The full
round-trip-safe artifact (sorted labels/annotations, canonical JSON
stringification) lives in `rule_artifact.ts` — the sidecar canonicalises
it before committing, and the pure-logic helpers reject anything that
fails round-trip on the way back.

## 3. Why this design

### 3.1 Why a queue index, not a direct git push

Three reasons:

1. **Credentials boundary.** Git credentials would have to live in the
   Kibana cluster if writes were direct, expanding the blast radius
   of a Kibana compromise. The queue keeps Kibana stateless about git.
2. **Provider neutrality.** GitHub, GitLab, Bitbucket, on-prem gitea —
   all have different APIs. The queue lets the org swap the sidecar
   without touching the in-cluster workflow.
3. **Decoupling.** A transient git outage shouldn't block ARGUS
   synthesis. The queue absorbs the delay and the sidecar drains it
   on its own cadence.

### 3.2 Why CRD-shaped envelope, not raw `CandidateRule`

Adding a metadata layer (`apiVersion`/`kind`/`metadata`) makes the
artifact:

- **Versionable** — `apiVersion: argus.elastic.co/v1` lets us
  introduce v2 with a breaking change while keeping v1 readable.
- **Discoverable** — kubectl-style tools (any YAML reader) recognise
  the shape.
- **Extensible** — labels and annotations are an established
  convention for "data that doesn't change behaviour but is useful for
  filtering" (e.g. `tier: platinum`, `synthesis_run_id: ...`).
- **Familiar** — every SRE team has seen K8s CRDs.

Round-tripping back to `RuleLikeInput` drops the metadata layer (it's
not part of the rule's *behaviour*), but the artifact retains the
provenance for audit.

### 3.3 Why reject on schema drift instead of best-effort parse

The reverse path is the gate that prevents a corrupted artifact from
flowing back into the applier. If a sidecar rewrites `apiVersion` to
something custom and we silently strip it, we lose the signal that
*the artifact was tampered with*. Throwing loudly is the right
behaviour — the queue row stays `pending` and the operator sees the
rejection in the audit trail.

### 3.4 Why deterministic key ordering

`stringifyArtifact` produces byte-identical JSON for byte-identical
input. This matters because:

- Two synthesis runs that produce semantically-identical rules
  produce the same git commit hash, so duplicate work doesn't
  duplicate PRs.
- `git diff` between two artifact versions shows only the meaningful
  changes, not noise from re-ordered map keys.
- Code review is humane — reviewers see the *change*, not key
  shuffling.

## 4. What does not ship today (deliberately deferred)

- **Out-of-cluster sidecar agent.** A small Go / TypeScript runner
  that reads `.soc-dac-export-queue?status=pending`, runs `git
  checkout -b argus-rule/<rule_id>-v<version>`, writes
  `artifact_json` to `rules/<rule_id>.json`, opens a PR, and updates
  the queue row with `status: pr_opened` + `git_status.pr_url`. The
  in-cluster contract this RFC ships is provider-agnostic — the
  sidecar is the only piece that knows about a specific git provider.
- **Reverse-merge applier workflow.** A `soc-argus-dac-applier.yaml`
  that watches for `status: pr_merged` rows and applies the merged
  artifact to the detection engine, completing the round trip.
  Merging a manual edit in git becomes the source-of-truth for the
  rule's next state. Deferred because the forward path (B4 spike)
  is independently valuable; the reverse path is best built on top
  of demonstrated forward-path stability.
- **YAML output.** `stringifyArtifact` produces JSON. Adding a
  `stringifyArtifactYaml` would just `yaml.stringify(artifact)`;
  deferred until the sidecar picks a format.
- **Multi-rule artifacts.** The current shape is one-artifact-one-
  rule. Bundling N rules into one PR is a future affordance.

## 5. Test coverage

23 unit tests in `rule_artifact.test.ts`:

- `toArtifact`: 13 tests — envelope shape, default source, source
  override, optional fields, label/annotation key ordering, query
  preservation, gate_overrides preservation/sorting, throws on
  empty `rule_id` / `rule_version` / non-object `query`.
- `fromArtifact`: 8 tests — round-trip with no extras, round-trip
  with `gate_overrides`, drops `authored_by`/`at` on parse (round-
  trip is rule-shape only), rejects unsupported `apiVersion` / `kind`,
  rejects missing `metadata.name`, rejects missing `spec.query`,
  rejects non-object input.
- `stringifyArtifact`: 2 tests — deterministic output identity,
  round-trip through `JSON.parse` + `fromArtifact`.

The workflow's Liquid template is exercised at the live-benchmark
layer (Wave 6). The sidecar contract is exercised by manual operator
testing once a sidecar exists.

## 6. Migration path (when the sidecar lands)

1. Stand up the sidecar agent (any language, any git provider).
2. Sidecar polls `.soc-dac-export-queue?status=pending` every N
   minutes.
3. For each row:
   - Run `fromArtifact(row.artifact)` to validate.
   - Run `stringifyArtifact(toArtifact(parsed))` to canonicalise.
   - `git checkout -b argus-rule/<rule_id>-v<version>`.
   - Write `rules/<rule_id>.json`.
   - `git commit -m "Add ARGUS rule <rule_id> v<version>"`.
   - Open a PR; capture URL.
   - Update queue row: `status: pr_opened`, `git_status.pr_url`,
     `git_status.committed_at`.
4. Add a server-side step `security.argusMarkDacExported` that
   stamps `argus.dac_exported_at` on the corresponding
   `.soc-mutation-intents` row so the workflow doesn't re-queue it
   on the next tick.
5. Add the reverse-merge applier (§4) once forward-path stability is
   demonstrated.

## 7. Risks & mitigations

- **Risk**: Sidecar opens duplicate PRs because the queue isn't
  marked complete fast enough.
  **Mitigation**: queue doc id = `mutation_intent_id` is idempotent;
  status transitions are append-only. The sidecar checks `status`
  before acting.
- **Risk**: Operator manually edits the rule in the Kibana UI; the
  applier overwrites with the next merged PR.
  **Mitigation**: documented as a known limitation. The reverse-
  merge applier (§4) makes git the source-of-truth, so manual UI
  edits become drift the operator must resolve in git. This is the
  enterprise SOC norm — UI edits are for emergencies only.
- **Risk**: PR floods if many rules are synthesised quickly.
  **Mitigation**: `fanout_max=50` per tick caps queue growth; the
  sidecar can batch-PR multiple rules into one commit if it wants.
