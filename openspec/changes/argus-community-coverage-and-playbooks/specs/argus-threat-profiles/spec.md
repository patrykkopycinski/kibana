## ADDED Requirements

### Requirement: Threat profile index

The system SHALL maintain an Elasticsearch index `.soc-threat-profiles`. Each document MUST carry at minimum:

- `profile_id: keyword` (used as `_id` for idempotency).
- `name: keyword`.
- `description: text`.
- `technique_ids: keyword` (array of ATT&CK technique IDs).
- `actor_ids: keyword` (array; optional).
- `source: keyword` — `builtin` or `user`.
- `created_at: date` / `updated_at: date`.

The index MUST be seeded with at least six built-in profiles: `ransomware`, `apt29`, `lazarus`, `midnight_blizzard`, `persistence`, `credential_access`.

#### Scenario: Seeder populates built-in profiles

- **WHEN** `scripts/argus_seed_threat_profiles.js` is run on an empty cluster
- **THEN** `.soc-threat-profiles` MUST contain exactly the six built-in profiles
- **AND** each profile document's `_id` MUST equal its `profile_id`
- **AND** re-running the seeder MUST NOT create duplicates (update-in-place)

#### Scenario: User profiles coexist with built-ins

- **WHEN** a user-authored profile is indexed with `source: 'user'` and a distinct `profile_id`
- **THEN** it MUST appear in `GET /internal/security_solution/argus/threat_profiles`
- **AND** the seeder re-run MUST NOT touch user-sourced documents

### Requirement: Threat profile HTTP routes

The plugin SHALL register two read routes gated on `capabilities.siem.argus_read`:

- `GET /internal/security_solution/argus/threat_profiles` — returns the full list ordered by `name`.
- `GET /internal/security_solution/argus/threat_profiles/{profile_id}` — returns a single profile or 404.

#### Scenario: Unknown profile returns 404

- **WHEN** a GET request is made with `profile_id=nope`
- **THEN** the response status MUST be `404`
- **AND** the response body MUST identify the missing `profile_id`

### Requirement: Gap analysis filing mutation intents

A gap-analysis workflow triggered from a threat profile MUST write new `.soc-mutation-intents` documents with `argus.origin: 'gap_analysis'`, `argus.profile_id: <profile_id>`, and `status: 'queued'`. Writes MUST route through the existing mutation-intent builder; direct index writes from the workflow MUST NOT bypass governance fields (`governance_gate`, `source_signal`, `proposed_rule_delta` may be populated asynchronously by later workflow stages).

#### Scenario: Gap-analysis intents carry origin and profile

- **WHEN** the ransomware gap-analysis workflow completes for a profile with N uncovered techniques
- **THEN** `.soc-mutation-intents` MUST contain N new documents with `argus.origin: 'gap_analysis'` and `argus.profile_id: 'ransomware'`
- **AND** each document MUST include a `mutation_intent_id`, a `source_signal` referencing the profile, and a `status` of `queued`

### Requirement: User-extensible profiles

Operators MUST be able to add or update a profile by writing a YAML file under `soc-simulation/threat-profiles/` and re-running `scripts/argus_seed_threat_profiles.js`. The seeder MUST load all YAML files in that directory whose `source: user` is declared and upsert them alongside the built-ins.

#### Scenario: New YAML produces a new profile

- **WHEN** a YAML file `custom_exfiltration.yaml` is added under `soc-simulation/threat-profiles/`
- **AND** the seeder is re-run
- **THEN** `.soc-threat-profiles` MUST contain a document with `profile_id: 'custom_exfiltration'` and `source: 'user'`
- **AND** the Coverage panel's threat-profile picker MUST surface the new profile on reload
