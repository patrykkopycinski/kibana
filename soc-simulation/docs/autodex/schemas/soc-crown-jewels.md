# `.soc-crown-jewels` — crown-jewel asset register (B5)

> **Schema version:** 1.
> **Runtime contract:** [`CrownJewelDocSchema`](../../../../x-pack/solutions/security/plugins/security_solution/server/lib/argus/synthesis/contracts.ts).
> **Helper:** [`evaluateCrownJewelImpact`](../../../../x-pack/solutions/security/plugins/security_solution/server/lib/argus/governance/crown_jewel_impact.ts).
> **Closes:** vision-doc requirement **6.3** ("Defining crown-jewel assets") + the **HITL contract** clause that demands an asset-aware governance gate.
> **Tracked by:** B5 in [`conformance-matrix.md`](../conformance-matrix.md) §10.

---

## Why this index exists

The AutoDEX vision doc and the conformance matrix call out that **the
HITL contract is incomplete without an explicit notion of "assets we
will not let an autonomous loop touch without a human in the room"**.
Trust tiers + first-of-kind gates are necessary but not sufficient: a
bronze-tier agent that proposes a tuning to a rule monitoring the
**payment-authorisation host** is not the same risk as the same agent
proposing a tuning on a paved-road developer laptop. The applier needs
asset-level discrimination.

`.soc-crown-jewels` is that asset register. It is **operator-curated**
— ARGUS code never invents new entries. The autonomous applier and the
chat tools consume it; nothing else.

---

## Producers

`.soc-crown-jewels` is human-curated:

- **Asset register UI** (Console > Governance > Crown Jewels — TBD; today
  bulk-loaded via API).
- **`POST /.soc-crown-jewels/_doc`** with the canonical envelope below.
- **Bulk seed via fixtures**: `soc-simulation/fixtures/crown-jewels-*.json`
  (operator-controlled; not committed today).

Producers MUST validate every doc through `CrownJewelDocSchema` before
writing — catch drift at write-time, not boot-time. The schema rejects:

- Unknown `tier` (only `silver` / `gold` / `platinum` / `crown`).
- Unknown `asset_type` (only `host` / `user` / `service` / `data_store` / `group`).
- Unknown `match_patterns[].kind` (whitelist below).
- Empty `match_patterns[]` or empty `match_patterns[].values[]`.
- `recovery_priority` outside `[1, 10]`.

---

## Consumers

| Consumer | What it does |
| --- | --- |
| `evaluateCrownJewelImpact` helper | Pure function. Given `MutationTargets` + a snapshot of `.soc-crown-jewels`, returns a `CrownJewelAssessment` with the affected assets, max tier, and a `recommended_action` (`proceed` / `pending_review`). |
| `soc_autonomous_applier.yaml` (12th gate — wiring is a follow-up) | Calls a server-side workflow step that wraps `evaluateCrownJewelImpact`; if the assessment recommends `pending_review`, the applier defers and writes a `.soc-autonomy-decisions` row with `failing_gate: 'crown_jewel'`. |
| Audit dashboards | Read every applier decision row's `crown_jewel_assessment` payload and chart "intents that grazed crown jewels". |
| Reviewer UI (HITL) | Surfaces the matched asset list + tier so a reviewer sees *why* an intent was parked. |

---

## Required fields

| Field | Type | Purpose |
| --- | --- | --- |
| `@timestamp` | ISO-8601 string | Indexed timestamp. |
| `asset_id` | non-empty string | Stable cluster-unique ID. Convention: `cj-<env>-<scope>-<short>` (e.g. `cj-prod-pki-root`). |
| `asset_type` | enum: `host` / `user` / `service` / `data_store` / `group` | Kind of asset. |
| `name` | non-empty string | Human-readable label rendered in the reviewer UI. |
| `tier` | enum: `silver` / `gold` / `platinum` / `crown` | Business-value tier (see escalation matrix below). |
| `owner` | non-empty string | Team / individual accountable. Surfaces in the queue UI. |
| `match_patterns` | non-empty array of matchers (≥1) | How to recognise the asset in detection-rule output. See "Match patterns" below. |

## Optional fields

| Field | Type | Purpose |
| --- | --- | --- |
| `schema_version` | literal `1` | Indexed integer when the operator wants to lock against future bumps. |
| `description` | string | Free-text. |
| `business_function` | string | Short prose explaining what the asset does. |
| `tags` | string[] | Free-form labels. |
| `compliance_scope` | array of `pci` / `sox` / `hipaa` / `gdpr` / `iso27001` / `fedramp` | Drives review-queue routing for compliance review boards. |
| `recovery_priority` | integer in `[1, 10]` | Operator-asserted RTO ranking; 1 = highest. Surfaces in the audit log so a reviewer knows which assets need fastest recovery if the rule misfires. |
| `gate_active` | boolean (default `true`) | If `false`, the asset is registered for **visibility only** — the helper still reports the match but the `recommended_action` does NOT escalate from `proceed` to `pending_review`. Use this during onboarding before the asset is fully tagged. |

---

## Tier → escalation matrix

The helper applies this table when computing `recommended_action`:

| Max tier matched | `gate_active=true` exists? | `recommended_action` |
| --- | :-: | :-: |
| `none` | n/a | `proceed` |
| `silver` only | yes | `pending_review` |
| `silver` only | no (all `gate_active=false`) | `proceed` (visibility-only) |
| `gold` | n/a | `pending_review` |
| `platinum` | n/a | `pending_review` |
| `crown` | n/a | `pending_review` (assessment carries `crown_match: true` for loud highlighting) |

The helper never blocks outright — `recommended_action` is one of
`proceed` or `pending_review`. Hard blocks remain the operator's job
via `.soc-kill-switch`.

---

## Match patterns

`match_patterns[]` is an array of `{ kind, values, match_mode? }` objects.
Multiple matchers OR together (any match → asset is affected). Within a
single matcher, `values[]` ORs together too.

| `kind` | Compares against | Modes |
| --- | --- | --- |
| `host_name` | `host.name` field on the rule's matched docs | `terms` (default), `wildcard` (`*` glob) |
| `host_ip` | `host.ip` / `source.ip` / `destination.ip` | `terms` (default), `wildcard` |
| `host_ip_range` | same as `host_ip` | always **CIDR** (IPv4 only in v1) |
| `user_name` | `user.name` | `terms` (default), `wildcard` |
| `user_id` | `user.id` | `terms` (default), `wildcard` |
| `service_name` | `service.name` | `terms` (default), `wildcard` |
| `index_pattern` | the rule's index patterns (e.g. `logs-finance-*`) | `terms` (default), `wildcard` |
| `tag` | per-doc `host.tags`/`user.tags`/etc. asserted by the producer | `terms` (default), `wildcard` |

### Match-mode semantics

- `terms` (default): exact-string compare (Set membership).
- `wildcard`: simple `*` glob (regex characters are escaped in non-`*` segments). No `?`, no character classes — that intentional minimalism keeps the gate easy to reason about in incident review.
- `host_ip_range`: each `values[]` entry is a CIDR (e.g. `10.0.42.0/24`). Malformed CIDRs are silently skipped at evaluation time **and** rejected at write-time by `CrownJewelDocSchema`. IPv6 CIDRs are out of scope for v1.

---

## Examples

### Single host, gold tier

```json
{
  "@timestamp": "2026-05-05T00:00:00Z",
  "asset_id": "cj-prod-pki-root",
  "schema_version": 1,
  "asset_type": "host",
  "name": "PKI Root CA",
  "tier": "crown",
  "owner": "identity-platform",
  "business_function": "Issues all internal cert chains.",
  "match_patterns": [
    { "kind": "host_name", "values": ["pki-root-1", "pki-root-2"] },
    { "kind": "host_ip_range", "values": ["10.0.42.0/24"] }
  ],
  "compliance_scope": ["sox", "iso27001"],
  "recovery_priority": 1,
  "gate_active": true
}
```

### Wildcard host fleet

```json
{
  "@timestamp": "2026-05-05T00:00:00Z",
  "asset_id": "cj-prod-payments",
  "asset_type": "group",
  "name": "Payment authorisation fleet",
  "tier": "platinum",
  "owner": "payments-platform",
  "match_patterns": [
    {
      "kind": "host_name",
      "values": ["payment-gateway-*"],
      "match_mode": "wildcard"
    }
  ]
}
```

### Visibility-only registration

```json
{
  "@timestamp": "2026-05-05T00:00:00Z",
  "asset_id": "cj-onboarding-staging",
  "asset_type": "host",
  "name": "Staging payments cluster (in onboarding)",
  "tier": "silver",
  "owner": "payments-platform",
  "match_patterns": [
    { "kind": "host_name", "values": ["staging-payments-*"], "match_mode": "wildcard" }
  ],
  "gate_active": false
}
```

The third example **registers** the host group in the audit trail
without escalating any silver match to `pending_review`. Useful while
the operator is still verifying tags and ownership.

---

## Forward compatibility

`CrownJewelDocSchema` uses `.passthrough()`, so producers may attach
extra fields (e.g. `runbook_url`, `slack_channel`, `last_drill_at`)
without coordinating a schema bump. Bumping `SOC_CROWN_JEWELS_SCHEMA_VERSION`
is reserved for backward-incompatible changes (a removed required field,
a renamed `tier` enum value, etc.) and triggers the same dual-branch
migration pattern documented in [`README.md`](./README.md).

---

## Drift history

| Date | Tag | Drift | Resolution |
| --- | --- | --- | --- |
| 2026-05-05 | B5 | `.soc-crown-jewels` did not exist. Vision-doc 6.3 was unimplemented. Trust tiers were the *only* discriminator the autonomous applier had. | Schema + helper + 21 helper tests + 8 contract tests landed. Per-index doc (this page) committed. Applier YAML wiring is a one-step follow-up. |

---

## Wiring into the autonomous applier (follow-up)

`evaluateCrownJewelImpact` is a pure function. To enable the gate in
production:

1. Register a server-side workflow step
   `security.argusEvaluateCrownJewelImpact` that takes `targets` (or a
   `mutation_intent_id`), loads `.soc-crown-jewels` via the workflow's
   scoped ES client, calls `evaluateCrownJewelImpact`, and returns the
   `CrownJewelAssessment`.
2. Insert a step in `soc_autonomous_applier.yaml` between the trust-tier
   gate (gate 8) and the budget gate (gate 9):

   ```yaml
   - name: gate_crown_jewel
     type: security.argusEvaluateCrownJewelImpact
     with:
       intent_id: "{{ steps.intent.output._id }}"

   - name: gate_crown_jewel_pass
     type: console
     with:
       message: "{% if steps.gate_crown_jewel.output.recommended_action == 'pending_review' %}no{% else %}yes{% endif %}"
   ```

   Then add `if: "steps.gate_crown_jewel_pass.output: yes"` on the
   subsequent gates so the cascade routes to `pending_review` on a
   crown-jewel match — same pattern as the existing 11 gates.
3. Persist the assessment payload on the `.soc-autonomy-decisions` row
   (`failing_gate: 'crown_jewel'`, plus the matched assets list).

The deferral is intentional: the helper + schema + tests are the
load-bearing parts. Wiring the workflow step is mechanical YAML and
benefits from a dedicated PR with a live cluster validation tick.
