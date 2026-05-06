# B10 — Incident TTPs → Threat Intel reverse loop

> Status: **partially resolved 2026-05-05** — pure-logic spec ships
> with full unit-test coverage; YAML workflow ships in conservative
> "one row per technique" mode; the registered server-side step that
> mirrors the full TS spec is the next surface to wire.

## 1. The gap

Vision-doc §1.7.4 lists "Incident TTPs → threat intel" as one of the
six feedback loops AutoDEX needs to close. As of B16 the loop was
strictly one-way: KEV / CTI / Mythos signals flow *into*
`.soc-cve-advisories` and `.soc-intel-feed`, then synthesize rules
out of those advisories. There was no producer that turned a *closed
incident* — i.e. a real adversary actually doing something in the
target environment — into intel that future synthesis ticks can see.

That is a strict regression vs the vision: the highest-signal source
of "what techniques actually matter for this org" is the org's own
incident history, and AutoDEX was throwing that signal away.

## 2. What ships today

1. **Pure-logic spec** —
   [`x-pack/.../server/lib/argus/intel/reverse_intel_extractor.ts`](../../../../x-pack/solutions/security/plugins/security_solution/server/lib/argus/intel/reverse_intel_extractor.ts).
   `extractReverseIntel({ incidents, outcomes, window, thresholds }) →
   { emissions, skipped, window, thresholds_applied }`. 24 unit tests
   cover threshold resolution, TP/FP separation, threshold gating,
   technique aggregation, deterministic ordering, defensive parsing of
   malformed inputs, and the canonical `.soc-intel-feed` envelope
   shape (intel_id stable per technique × observed_at).

2. **Workflow** —
   [`soc-simulation/workflows/soc_incident_reverse_intel.yaml`](../../../workflows/soc_incident_reverse_intel.yaml).
   Reads `.soc-forensic-summary` + `.soc-outcomes` over the last
   hour, emits one `.soc-intel-feed` row per technique observed, and
   heartbeats on `.soc-audit-trail`. Hourly cadence + manual trigger.

3. **Schema doc** —
   [`schemas/soc-intel-feed.md`](../schemas/soc-intel-feed.md)
   extended with the new `kind: ttp_observed` row contract and the
   `evidence.*` audit-trail block.

## 3. Verdict / threshold matrix (the spec)

The pure-logic helper applies these defaults
(`DEFAULT_REVERSE_INTEL_THRESHOLDS`):

| Threshold | Default | Meaning |
|---|---:|---|
| `min_observations` | 2 | Minimum **true-positive** sightings of the technique in the window before any signal is emitted. False positives count toward `evidence` only. |
| `base_signal_strength` | 0.4 | Strength of a single confirmed observation. |
| `per_extra_observation` | 0.1 | Per-extra-observation bump on top of base. |
| `max_signal_strength` | 0.95 | Cap; saturates aggressively to keep one noisy technique from drowning out external CTI. |
| `half_life_days` | 14 | Mirrors the existing `.soc-intel-feed` decay convention used by the Mythos aggregator. |
| `source_trust` | 0.85 | Per-feed trust weight. Higher than the generic adapter (0.5) and Mythos (0.6) because the source is the org's own confirmed incidents — about as ground-truth as it gets. |

Override semantics:

- `min_observations`, `half_life_days`: integer; non-finite → default;
  fractional → floor; below 1 → 1.
- `base_signal_strength`, `max_signal_strength`,
  `per_extra_observation`, `source_trust`: unit-bounded; non-finite
  → default; out-of-range → clamped into `[0, 1]`. Out-of-range
  is treated as user intent ("`source_trust=-0.5` means zero trust"),
  not as broken input.
- `max_signal_strength` is auto-promoted to `base_signal_strength` if
  the override would invert them (so the cap can never drop below the
  baseline of a single confirmed observation).

## 4. What counts as a confirmed observation

Inputs:

- **Incidents** (`.soc-forensic-summary`): a closed case. Verdict
  vocabulary `{true_positive, confirmed_threat, confirmed, malicious,
  tp}` counts as TP; `{false_positive, benign, fp}` counts as FP.
  Anything else (`inconclusive`, `pending_review`) is ignored.
- **Outcomes** (`.soc-outcomes`): a per-alert observation with
  `techniques_observed[]`. Verdict vocabulary same as above. The
  explicit `false_positive: true` flag overrides the verdict text.

Each technique observed in a TP source bumps `true_positive_count`
by 1. Each technique in an FP source bumps `false_positive_count`.
False positives are **not subtractive on the first pass** — they
appear in the emission's `evidence` block but do not lower
`signal_strength`. The reasoning:

- A technique that fires both real attacks and false alarms is *more*
  worth grounding, not less — the FP volume is itself information
  for the variant bank (see B13).
- Subtractive penalties are easy to game accidentally — a single
  noisy rule that produces 99 FPs would erase 99 TPs of real attack
  data. The conservative path is "log it, score later".

A future iteration can wire a per-technique penalty if calibration
shows the FP shoulder is hurting precision.

## 5. Why `.soc-intel-feed`, not `.soc-cve-advisories`

`.soc-cve-advisories` is the CVE-shaped advisory envelope: it carries
`cve_id`, `kev.*`, `target_platforms`, `mitre_techniques[]`. Incident
TTPs are not CVEs — they are confirmed adversary behaviour with no
specific vulnerability ID. Forcing them into the CVE envelope would
either lie about a fake `cve_id` or violate the advisory schema.

`.soc-intel-feed` is the abstract intel signal stream that already
serves Mythos / generic / Glasswing adapters. The reverse-intel adapter
becomes one more producer on the same canonical contract: same
`intel_id` / `feed_id` / `adapter` / `kind` / `signal_strength` /
`half_life_days` / `source_trust` shape. The downstream Mythos
aggregator and any future synthesis ticks already know how to
weight a `.soc-intel-feed` row; nothing new has to be wired.

If we later want incident TTPs to *drive* synthesis directly (vs
just decorating advisories), that's a separate adapter that converts
high-strength `.soc-intel-feed` rows into `.soc-cve-advisories`
docs — a one-step follow-up that doesn't need to be in B10's scope.

## 6. Migration path: from "one row per technique" to full-fidelity emissions

The shipping YAML emits one `.soc-intel-feed` row per technique per
incident, with `signal_strength = base_signal_strength` and
single-technique `distinct_*` arrays. That is intentionally
conservative — it produces sound output without trying to do
multi-pass aggregation in Liquid templates.

The full-fidelity behaviour (aggregate across the window per
technique, sum TP/FP counts, dedupe `distinct_actors` /
`distinct_campaigns`, saturate signal_strength against the cap) lives
in `extractReverseIntel`. The follow-up is to register a
`security.argusReverseIntelExtract` workflow step that:

1. Reads `state.read_forensic_summaries` and `state.read_outcomes`.
2. Calls `extractReverseIntel` from the server bundle.
3. Emits the `emissions` array as `bulk` ops to `.soc-intel-feed`.

This is the same pattern used by `security.argusSynthesizeAdvisory`
(B1) and `security.argusEvaluateCrownJewelImpact` (B5 follow-up).
The TS spec is already test-covered — the registered step is just an
ES-client adapter around it.

## 7. What does NOT ship today (deliberately deferred)

- **Per-technique signal_strength saturation in the YAML.** Without a
  registered step, the YAML can't aggregate across the window in
  pure Liquid. Mitigated by capping `signal_strength = base` so a
  single technique never overshoots the cap from this adapter alone.
- **Subtractive FP penalty.** See §4. Hold for calibration data.
- **Incident-driven synthesis** (`.soc-intel-feed` → `.soc-cve-advisories`
  for high-strength rows). Separate adapter; out of scope for B10.
- **Dedup against existing CTI signals** (don't emit if KEV already
  covers the technique). Worth doing once we have the calibrated
  signal-strength data; premature in v1.

## 8. Risks and open questions

- **Privacy.** Incident TTPs implicitly leak which techniques an org
  has actually been hit by. The `.soc-intel-feed` is internal-only by
  default but the adapter writes plain English summaries
  ("Technique T1059.001 observed in confirmed incident case-12345…").
  If `.soc-intel-feed` ever becomes shareable, the adapter needs an
  opt-in flag and per-row redaction. Tracked as a follow-up; the
  internal-only default is safe for now.
- **Verdict vocabulary drift.** The TP/FP whitelists are explicit
  string sets. Any new disposition value (e.g. `partial_threat`,
  `confirmed_credential_theft`) needs to be added to the spec or it
  will be silently ignored. Linked to B16 schema-convergence work.
- **`techniques_observed[]` quality.** This field exists on
  `.soc-outcomes` but is populated at triage time; if triage skips it
  the reverse-intel signal goes to zero. Real-world calibration depends
  on triage hygiene, which is itself partly what AutoDEX is improving.
  Bootstrap risk is low because the workflow is additive — no signal
  vs no signal.

## 9. Where this lives in code

```
x-pack/solutions/security/plugins/security_solution/server/lib/argus/intel/
├── reverse_intel_extractor.ts          ← pure-logic spec (this RFC)
└── reverse_intel_extractor.test.ts     ← 24 jest unit tests

soc-simulation/workflows/
└── soc_incident_reverse_intel.yaml     ← workflow

soc-simulation/docs/autodex/
├── rfcs/B10-incident-reverse-intel.md  ← THIS DOC
└── schemas/soc-intel-feed.md           ← extended with ttp_observed kind
```

## 10. Validation status

- 24 / 24 jest tests green
  (`x-pack/.../argus/intel/reverse_intel_extractor.test.ts`).
- ESLint clean on the spec + tests.
- YAML linting handled by the workflow engine on import; smoke-test
  is "import the workflow against a stack with the canonical seed
  pack and look for `.soc-intel-feed` rows with `adapter:
  soc_incident_reverse_intel`".
- Live re-validation of the loop closing is queued behind the next
  benchmark run; the spec-level proof is the unit-test suite.
