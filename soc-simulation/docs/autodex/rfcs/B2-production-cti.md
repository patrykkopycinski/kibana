# B2 — Production CTI source

> Status: **partially resolved 2026-05-05** — KEV → `.soc-intel-feed`
> fanout spike workflow lands; analytics-cluster + STIX/TAXII adapters
> remain as Phase 2 / Phase 3 deliverables.

## 1. The gap

Vision-doc §1.2.2 and §1.8.2, plus §3.1 ("Intelligence consumption") in
the conformance matrix, all flag the same thing: AutoDEX has
**adapter scaffolds** but no **production CTI source** wired into the
threat-intel lane. Three observable symptoms today:

1. **`.soc-intel-feed` only contains demo seeds.** The
   `soc-argus-intel-adapter-generic` workflow ships four hardcoded
   `seed-cve-2025-M100x-*` rows on first tick. The Mythos aggregator
   (`soc-argus-intel-mythos-aggregator`) reads these, computes a
   trust-weighted bounded-[0,1] signal, and surfaces it on the
   ARGUS console — but the input is fiction.
2. **The analytics-cluster adapter is a stub.** The
   `soc-argus-intel-adapter-analytics` workflow's documented purpose is
   "Daily ETL pipeline that queries `ia-cti_enrichment` index from the
   analytics SDE cluster", but there's no cross-cluster client, no
   auth handshake, no transformation pipeline, and no production
   tenant configured.
3. **KEV ingest is wired to advisories, not intel-feed.** The
   `@kbn/argus-kev-ingest` package + `soc-kev-ingest.yaml` workflow
   already pull the CISA Known Exploited Vulnerabilities catalog every
   30 minutes and write to `.soc-cve-advisories` — the **advisory
   lane** Path A consumes. The **intel-feed lane** the
   exploit-probability scorer reads remains unfed.

The blocker is exactly the second-and-third bullets: a real production
CTI signal exists (KEV) but doesn't fan out into the intel-feed lane;
the alternative source (analytics CTI enrichment) is gated on an
authorisation decision that hasn't been made.

## 2. The Phase 1 spike (this RFC)

`soc-argus-intel-adapter-kev.yaml` is a **batch-ETL fan-out workflow**
that closes the symptom #3 gap with zero new auth and no new HTTPS
clients:

- **Source**: `.soc-cve-advisories` rows where `source = cisa_kev`,
  filtered to the 24h window. The fetch already happens in
  `@kbn/argus-kev-ingest` (R14); this workflow is downstream of it.
- **Transform**: each KEV advisory becomes one
  `.soc-intel-feed` row of `kind: exploit_availability`.
  - `signal_strength = 0.85` — KEV inclusion is strong evidence of
    in-the-wild exploitation, but it's a static catalog signal (not as
    strong as a Mythos-aligned campaign).
  - `half_life_days = 30` — KEV entries don't decay quickly; they
    remain operationally relevant until a rule lands.
  - `source_trust = 0.9` — CISA-curated, US-government, public,
    auditable. Highest available without a private-feed contract.
- **Sink**: `.soc-intel-feed` with deterministic `intel_id =
  kev-<cve_id>` so reruns are idempotent (`op_type: index` overwrites
  the same docs).
- **Cadence**: every 30 minutes (matches `soc-kev-ingest`'s cadence so
  the lag between catalog publication and intel-feed visibility stays
  below an hour).

The spike proves the **adapter pattern** with real data: the Mythos
aggregator now has a production CTI signal feeding it on every tick,
and the M2.3 exploit-probability scorer's `mythos_signal` contributor
becomes truthful for any CVE that's in KEV.

## 3. Why this design

### 3.1 Why fan-out from advisories instead of fetching twice

The CISA KEV catalog is a large JSON document (~1MB, ~1000 entries).
Fetching it twice — once for `.soc-cve-advisories` and again for
`.soc-intel-feed` — would be wasteful and create a consistency
problem (what if the two fetches see different catalog versions?).
Fanning out from the already-canonical advisory writer keeps a
single fetch, single source-of-truth, single audit trail.

### 3.2 Why a separate workflow instead of a step inside `soc-kev-ingest`

`soc-kev-ingest` already does three things (freshness metric, unprocessed
funnel, due-soon escalation). Adding a fourth step that writes to a
different index would couple the advisory lane and the intel-feed lane —
if the fan-out logic ever needs to change cadence, batching, or trust
weight, decoupled workflows make that a one-PR change. The adapter
contract is also more discoverable as its own file (`adapter:
argus_intel_adapter_kev`) than as a step buried inside an unrelated
workflow.

### 3.3 Why `kind: exploit_availability` and not `actor_capability`

KEV inclusion certifies the vulnerability has been **exploited
in the wild** — that's about availability of an exploit, not about
which actor used it. Some KEV entries have `kev.known_ransomware_use:
true`, but the intel-feed schema doesn't have a `ransomware` kind, so
those edge cases stay `exploit_availability` (the operator can read
the `summary` text or the `raw` passthrough for the ransomware flag).
Splitting `exploit_availability` into ransomware vs non-ransomware is a
follow-up — the schema is `dynamic: false` so adding a new `kind` is a
contract decision, not a YAML change.

### 3.4 Why source_trust = 0.9 and not 1.0

CISA KEV is the highest-trust **public** source available, but not
infallible — the catalog occasionally adds entries that turn out to be
not-actively-exploited and get retracted. A private-feed source with a
tenant SLA could legitimately rate higher. Reserving `source_trust =
1.0` for that future case keeps the trust dimension meaningful.

## 4. Phase 2 — Cross-cluster analytics adapter (deferred)

The `soc-argus-intel-adapter-analytics` workflow's documented intent
is to query the analytics SDE cluster's `ia-cti_enrichment` index and
fan that into `.soc-intel-feed`. That's a higher-fidelity signal than
KEV (it includes per-tenant exploitation attempts, not just the public
catalog), but it requires:

- A cross-cluster auth decision (API key vs service account vs
  certificate-pinned mTLS).
- A per-tenant data-classification review (the SDE cluster contains
  customer telemetry; CTI rows must be scrubbed of customer
  identifiers before crossing the trust boundary).
- A throughput plan (the SDE cluster is heterogeneous; a 5-minute
  fan-out cadence may not be sustainable).

These are organisational decisions that block the workflow itself.
**This RFC explicitly defers Phase 2** until those decisions are made;
the adapter scaffold stays in tree as documentation of the target
shape.

When Phase 2 lands, the same fan-out pattern this spike establishes
applies — only the source changes. The adapter contract
(`feed_id` / `adapter` / `kind` / `reference` / `signal_strength` /
`half_life_days` / `source_trust`) is identical.

## 5. Phase 3 — STIX/TAXII 2.1 adapter (deferred)

Tenant-private CTI feeds (Glasswing, vendor-specific MISP exports,
ISAC feeds) are most easily consumed via STIX/TAXII 2.1. A
`@kbn/argus-taxii-adapter` package would do the polling, deserialise
STIX bundles into the canonical envelope, and bulk-index. This is
larger scope than Phase 2 because STIX has its own data model
(`indicator`, `malware`, `threat-actor`, `attack-pattern`) that needs
mapping to our `kind` enum. Deferred until Phase 2 demonstrates the
adapter pattern at production cadence.

## 6. What does not ship today (deliberately deferred)

- **No cross-cluster client.** Phase 1 stays in-cluster (reads
  `.soc-cve-advisories`, writes `.soc-intel-feed`).
- **No streaming consumption.** The 30-minute batch cadence matches
  the upstream KEV cadence; tighter latency adds operational cost
  without intel-quality benefit (KEV doesn't update faster than that).
- **No transform-time enrichment.** The fan-out is mechanical: KEV row
  in → intel-feed row out. ATT&CK technique mapping happens at KEV
  ingest time (`mapKevEntry` in `@kbn/argus-kev-ingest`) and is just
  forwarded.
- **No backfill.** The workflow only fans out the last 24h. A
  one-time backfill (every KEV entry ever) is a separate operator-run
  CLI invocation.
- **No `.soc-intel-feed` mapping change.** The spike uses the existing
  schema (`schema_version: 1`); no contract drift.

## 7. Test coverage

The fan-out logic itself is a thin Liquid template over an existing
ES search. End-to-end coverage comes from:

- **Upstream**: `kbn-argus-kev-ingest`'s 11 jest tests cover the
  KEV fetch + map + bulk-index path. If KEV ingestion regresses,
  the fan-out simply has nothing to fan.
- **Downstream**: the Mythos aggregator's existing test suite covers
  the `.soc-intel-feed` → per-CVE-signal pipeline.
- **Spike-level**: the workflow itself is verified by the live
  benchmark — Wave 6 will confirm that after one fan-out tick, the
  per-CVE `mythos_signal` for KEV CVEs is non-zero on the ARGUS
  console.

A dedicated workflow-execution test (writing fixture KEV rows,
running the workflow, asserting the fanned-out intel-feed rows) is a
follow-up — the workflow harness for in-cluster YAML execution is
shared with B1's `soc-argus-synthesis-driver` and can be reused.

## 8. Risks & mitigations

- **Risk**: KEV catalog drift (a CVE retracted by CISA still lives in
  `.soc-intel-feed`).
  **Mitigation**: `half_life_days = 30` — the Mythos aggregator
  applies exponential decay, so a stale row's contribution naturally
  approaches zero over a month even without explicit deletion. A
  follow-up PR can add a tombstone step that flips
  `signal_strength = 0` when an advisory is retracted upstream.
- **Risk**: Fan-out lag exceeds 30m (workflow execution slow).
  **Mitigation**: `fanout_max = 100` caps per-tick work; on cold
  start the backlog drains in three ticks even with 1000 KEV
  entries.
- **Risk**: The advisory lane and intel-feed lane disagree about a
  CVE (e.g., advisory says CVE-X exists, intel-feed never gets the
  fan-out row because the advisory was written 25h ago).
  **Mitigation**: explicit operator-run backfill CLI exists as a
  Phase-1 follow-up; the 30m cadence keeps the steady-state lag
  under an hour.

## 9. Migration path for Phase 2 / Phase 3

When Phase 2 lands, the adapter shape stays identical — only the
source query and the constants (`feed_id`, `adapter`, `source_trust`)
change. The existing `argus_intel_adapter_generic` (demo) and
`argus_intel_adapter_kev` (B2) workflows serve as templates. The
Mythos aggregator already supports multiple `feed_id`s
trust-weighted into a single per-CVE signal, so adding a third
adapter is purely additive.

When Phase 3 lands, the new package wraps the pattern; the canonical
`.soc-intel-feed` envelope stays the same.
