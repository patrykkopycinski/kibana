# `.soc-dac-export-queue` — DaC export message bus (B4)

> **Schema version**: 1
> **Producers**: `soc_argus_dac_export.yaml` (B4)
> **Consumers**: out-of-cluster DaC sidecar agent (deferred; the
> sidecar is the only component that holds git credentials and opens
> PRs)
> **Index template**: [`soc-simulation/setup/index_templates/soc-dac-export-queue.json`](../../../setup/index_templates/soc-dac-export-queue.json)

## Purpose

`.soc-dac-export-queue` is the **message bus** between the in-cluster
ARGUS workflow that synthesises rules and the out-of-cluster sidecar
agent that opens PRs against a git provider. Every applied
ARGUS-authored mutation produces one row here; the sidecar drains
the queue, opens a PR, and updates the row's `status` / `git_status`.

Why a queue, not a direct git push?

1. **Credentials boundary** — git credentials never enter Kibana.
2. **Provider neutrality** — GitHub, GitLab, Bitbucket, on-prem
   gitea: swap the sidecar without touching the workflow.
3. **Decoupling** — a transient git outage doesn't block ARGUS
   synthesis; the queue absorbs the lag.

See [`rfcs/B4-dac-export.md`](../rfcs/B4-dac-export.md) for the full
design rationale.

## Document shape

```jsonc
{
  "@timestamp": "2026-05-05T22:14:08.123Z",
  "queue_id":   "intent-abc123",            // = mutation_intent_id, idempotent doc id
  "rule_id":    "argus-cve-2026-1234-v1",
  "rule_version": "1",
  "source":     "argus",                     // argus | manual | imported
  "status":     "pending",                   // pending | pr_opened | pr_merged | pr_rejected
  "artifact": {                              // CRD-shaped envelope (object, enabled: false)
    "apiVersion": "argus.elastic.co/v1",
    "kind":       "ARGUSDetectionRule",
    "metadata": {
      "name":         "argus-cve-2026-1234-v1",
      "version":      "1",
      "source":       "argus",
      "authored_by":  "argus.synthesis.driver",
      "authored_at":  "2026-05-05T22:13:51.000Z",
      "labels":       { "tier": "platinum" },
      "annotations":  { "argus.io/origin": "synthesis_driver" }
    },
    "spec": {
      "name":        "Suspicious child of explorer.exe",
      "description": "ARGUS-synthesised detection",
      "query":       { "bool": { /* ... */ } },
      "gate_overrides": { "max_fp_rate": 0.04 }   // optional, B6
    }
  },
  "artifact_json": "{\"apiVersion\":\"…\"}",   // optional, byte-identical canonical form
  "git_status": {
    "branch":       null,        // populated by sidecar after `git checkout -b`
    "pr_url":       null,        // populated by sidecar after PR opens
    "committed_at": null,
    "merged_at":    null
  },
  "schema_version": 1
}
```

## Field reference

| Field | Type | Description |
| --- | --- | --- |
| `queue_id` | keyword | `mutation_intent_id`. Doubles as the doc id (idempotent). |
| `rule_id` | keyword | The synthesised rule id. |
| `rule_version` | keyword | Monotonic version inside ARGUS; the sidecar uses this in the branch name. |
| `source` | keyword | One of `argus` (synthesised), `manual` (operator-authored, exported for archival), `imported` (originated outside ARGUS). |
| `status` | keyword | `pending` → sidecar picks up; `pr_opened` → PR exists; `pr_merged` → merged into git; `pr_rejected` → operator closed without merge. |
| `artifact` | object, `enabled: false` | The full CRD envelope. Stored verbatim; not indexed. |
| `artifact_json` | text, `index: false` | Optional canonicalised JSON string for byte-identical git writes. |
| `git_status.branch` | keyword | `argus-rule/<rule_id>-v<version>`. |
| `git_status.pr_url` | keyword | URL of the opened PR. |
| `git_status.committed_at` | date | When the sidecar pushed the commit. |
| `git_status.merged_at` | date | When the PR was merged in git. |
| `schema_version` | integer | `1` today; bumps on backwards-incompatible changes. |

## Status state machine

```
                   ┌──────── operator closes without merge ───────┐
                   │                                              │
                   ▼                                              │
   pending  ──── sidecar opens PR ────►  pr_opened                │
       │                                    │                    │
       └─ workflow tick (idempotent;        └─ PR merges in git ──┴───►  pr_merged
          re-emits same queue_id; doc                              ▲
          version increments but content                           │
          unchanged)                                                pr_rejected
```

The reverse-merge applier (deferred — see RFC §4) watches for
`status: pr_merged` rows and applies the merged artifact back to the
detection engine, completing the loop and making git the
source-of-truth.

## Producer

[`soc_argus_dac_export.yaml`](../../../workflows/soc_argus_dac_export.yaml)
runs every 1h (manual trigger also supported). It queries
`.soc-mutation-intents` for `kind: rule_create`, `status: applied`,
`argus.origin: synthesis_driver`, `@timestamp >= now-24h`, `not
exists argus.dac_exported_at`, sorted by recency, capped at
`fanout_max=50` per tick.

For each hit, it writes one queue row with `id =
mutation_intent_id` (so re-runs don't duplicate). The Liquid
template emits a conservative envelope; the canonicalisation pass
that uses `lib/argus/dac/rule_artifact.ts` end-to-end is gated on a
registered server-side step `security.argusBuildDacArtifact` (see
RFC §4 deferred work).

A heartbeat row to `.soc-audit-trail` records the tick id and
`rules_queued`.

## Consumer (deferred sidecar contract)

A sidecar agent implementing the following contract drains the
queue:

1. Poll `.soc-dac-export-queue?status=pending` every N minutes.
2. For each row:
   1. Run `fromArtifact(row.artifact)` to validate (rejects loudly
      on schema drift).
   2. Run `stringifyArtifact(toArtifact(parsed))` to canonicalise to
      byte-identical JSON.
   3. `git checkout -b argus-rule/<rule_id>-v<version>`.
   4. Write `rules/<rule_id>.json`.
   5. `git commit -m "Add ARGUS rule <rule_id> v<version>"`.
   6. Open a PR; capture URL.
   7. Update queue row: `status: pr_opened`,
      `git_status.{branch, pr_url, committed_at}`.
3. On PR merge, update row to `status: pr_merged`,
   `git_status.merged_at`.
4. On PR close-without-merge, update to `status: pr_rejected`.

The sidecar is **not** in scope for this iteration. The contract is
documented so the sidecar can be built independently.

## Cross-references

- [`rfcs/B4-dac-export.md`](../rfcs/B4-dac-export.md) — design
  rationale, deferred work, migration path, risks.
- [`lib/argus/dac/rule_artifact.ts`](../../../../x-pack/solutions/security/plugins/security_solution/server/lib/argus/dac/rule_artifact.ts)
  — pure-logic serializer / parser / canonicaliser.
- [`soc-mutation-intents.md`](./soc-mutation-intents.md) — upstream
  source of every queue row.
