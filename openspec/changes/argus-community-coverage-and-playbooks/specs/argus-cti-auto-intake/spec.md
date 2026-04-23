## ADDED Requirements

### Requirement: CTI auto-intake scheduled workflow

The system SHALL ship a scheduled Kibana Workflow (`soc-simulation/workflows/soc-argus-cti-auto-intake.yaml`) that runs autonomously to turn new CTI feed entries into governance-gated draft mutation intents. The workflow MUST provide two cadences:

- An **hourly** fast-path that processes only the KEV feed delta
- A **nightly** full sweep that processes KEV, OTX, and vendor-advisory feeds

The workflow MAY be implemented as a single YAML file with two triggers OR as two sibling YAML files sharing a step library — both shapes satisfy this requirement.

Each workflow MUST declare `metadata.tags: [argus, argus:scheduled]`. The `argus:playbook` tag MUST NOT be applied, because the workflow is background automation, not user-triggerable.

#### Scenario: Hourly run triggers only on KEV delta

- **GIVEN** the previous hourly run finished at T
- **WHEN** the next hourly run fires at T+1h
- **THEN** it MUST query the KEV feed for entries `date_added > T`
- **AND** MUST NOT invoke the OTX or vendor-advisory feed steps

#### Scenario: Nightly run processes all configured feeds

- **WHEN** the nightly sweep fires
- **THEN** it MUST process KEV, OTX, and any configured vendor advisories
- **AND** MUST deduplicate against CVE IDs already present in `.soc-cve-advisories`

### Requirement: Workflow emits `origin: cti_ingest` intents via the canonical chain

For each new CVE, the workflow MUST invoke `soc-argus-exploit-to-detection` with `origin: cti_ingest`. The workflow MUST NOT write to `.soc-mutation-intents` directly. All produced intents MUST flow through the existing governance gate exactly like human-filed intents.

#### Scenario: New KEV CVE produces a governance-gated intent

- **GIVEN** the KEV feed adds `CVE-2026-1234` that is not in `.soc-cve-advisories`
- **WHEN** the hourly workflow runs
- **THEN** `.soc-cve-advisories` MUST gain a doc for `CVE-2026-1234`
- **AND** `.soc-mutation-intents` MUST gain at least one intent with `argus.origin: 'cti_ingest'` pointing at `CVE-2026-1234`
- **AND** that intent MUST be in `governance_gate.state: 'pending'` until the existing gate verdict lands

### Requirement: Per-run circuit breaker

The workflow MUST enforce a per-run cap on newly-filed intents (default `max_new_intents_per_run: 50`, configurable via workflow inputs). If the cap would be exceeded:

- Processing MUST halt after the 50th intent for the current run
- The run MUST emit a `.soc-audit-trail` summary doc with `{ kind: 'cti_auto_intake', status: 'cap_hit', new_cves, skipped, run_id }`
- The next scheduled run MUST check for a prior `cap_hit` status and, if found, MUST skip itself and emit a `.soc-audit-trail` doc with `status: 'circuit_open'`

The circuit MUST auto-close once a human-triggered ad-hoc run completes without hitting the cap OR once the `argusCtiAutoIntakeEnabled` flag is toggled off-then-on.

#### Scenario: Cap-hit skips the next scheduled run

- **GIVEN** the most recent auto-intake run emitted `status: 'cap_hit'`
- **WHEN** the next scheduled run fires
- **THEN** the workflow MUST emit `.soc-audit-trail` with `status: 'circuit_open'`
- **AND** MUST NOT invoke any feed step

### Requirement: Per-run audit summary

Every auto-intake run MUST write exactly one summary doc to `.soc-audit-trail` on completion (successful or skipped) with the shape:

```
{
  kind: 'cti_auto_intake',
  run_id: string,
  trigger: 'hourly' | 'nightly' | 'adhoc',
  feeds_processed: string[],
  new_cves: number,
  new_intents: number,
  skipped: number,
  errors: Array<{ feed: string, message: string }>,
  status: 'ok' | 'cap_hit' | 'circuit_open' | 'partial_failure',
  completed_at: date
}
```

#### Scenario: Feed failure is captured non-fatally

- **GIVEN** the OTX feed returns an HTTP 500 during a nightly run
- **WHEN** the workflow completes the KEV and vendor-advisory steps successfully
- **THEN** the audit summary MUST carry `status: 'partial_failure'`
- **AND** `errors` MUST include an entry with `feed: 'otx'`
- **AND** KEV + vendor intents MUST still be written

### Requirement: Feature flag `argusCtiAutoIntakeEnabled`

The workflow's scheduled triggers MUST be gated on the experimental flag `argusCtiAutoIntakeEnabled` (default `false`). When the flag is off:

- Scheduled triggers MUST NOT fire
- The workflow definition MUST still appear in the Workflows UI for ad-hoc manual invocation
- Ad-hoc invocations MUST still respect the cap and audit-summary contracts

#### Scenario: Flag off prevents schedule but allows manual run

- **GIVEN** `argusCtiAutoIntakeEnabled` is `false`
- **WHEN** the hour rolls over
- **THEN** the hourly trigger MUST NOT fire
- **AND** a manual invocation from the Workflows UI MUST execute end-to-end

### Requirement: Playbooks-tab summary widget

The Argus Console Playbooks tab MUST include a `CtiAutoIntakeSummaryWidget` that reads the most recent `.soc-audit-trail` doc with `kind: 'cti_auto_intake'` and renders:

- Timestamp of the most recent run
- Trigger type (hourly / nightly / adhoc)
- `new_intents` count with a link to Mutations panel filtered by `origin=cti_ingest` for that `run_id`
- A status badge (green ok / amber partial_failure / red cap_hit / grey circuit_open)
- A "Run now" button that triggers the workflow ad-hoc

When no audit summary exists yet, the widget MUST render an empty-state explaining how to enable the flag and run it manually.

#### Scenario: Red badge when the circuit is open

- **GIVEN** the latest summary has `status: 'circuit_open'`
- **WHEN** the Playbooks tab renders
- **THEN** the widget MUST show a red status badge
- **AND** MUST display guidance for running an ad-hoc intake to close the circuit

### Requirement: Demo seeder

A CLI `scripts/argus_seed_cti_auto_intake.js` MUST write a representative set of `origin: cti_ingest` mutation intents plus a mock `.soc-audit-trail` summary doc so the Playbooks-tab widget renders without requiring a live feed fetch. The seeder MUST be idempotent and use the canonical intent builder (no direct index writes).

#### Scenario: Seeder populates the widget

- **WHEN** `argus_seed_cti_auto_intake.js` runs on a clean cluster
- **THEN** the Playbooks tab Auto-Intake widget MUST render with a non-empty summary
- **AND** the Mutations panel MUST show ≥ 1 row with `origin: cti_ingest`
