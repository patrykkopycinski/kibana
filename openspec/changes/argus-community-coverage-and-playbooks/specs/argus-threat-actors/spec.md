## ADDED Requirements

### Requirement: Threat actors index

The system SHALL maintain an Elasticsearch index `.soc-threat-actors` populated from MITRE ATT&CK STIX data. Each document MUST carry at minimum:

- `actor_id: keyword` (stable STIX-derived id; used as `_id`).
- `actor_name: keyword`.
- `aliases: keyword` (array).
- `techniques: keyword` (array of ATT&CK technique IDs attributed to the actor).
- `software: keyword` (array of ATT&CK software / malware IDs).
- `first_seen: date` / `last_seen: date` (nullable).
- `references: keyword` (array of URLs).
- `stix_type: keyword` — `intrusion-set` | `malware` | `tool`.

#### Scenario: STIX ingest produces canonical actor docs

- **WHEN** `scripts/argus_ingest_stix.js` is run against an `enterprise-attack.json` snapshot
- **THEN** every `intrusion-set`, `malware`, and `tool` STIX object MUST produce a document in `.soc-threat-actors`
- **AND** each document MUST populate `techniques[]` from the `uses` relationships declared in STIX

#### Scenario: Repeated ingest is idempotent

- **WHEN** the STIX ingest is run twice with the same snapshot
- **THEN** no duplicate `actor_id` documents MUST exist
- **AND** `updated_at` MAY advance, but `created_at` MUST remain stable for unchanged actors

### Requirement: STIX ingest CLI

The system SHALL provide `scripts/argus_ingest_stix.js` wrapped via `@kbn/setup-node-env`, reading the STIX bundle path from `ATTACK_STIX_PATH` (env) or `--stix-path` (flag). The CLI MUST fail non-zero if the file is missing or invalid STIX.

#### Scenario: Missing STIX path fails fast

- **WHEN** the CLI is invoked with neither `ATTACK_STIX_PATH` set nor `--stix-path` provided
- **THEN** the CLI MUST exit non-zero before performing any Elasticsearch writes
- **AND** MUST log a human-readable error naming the missing env/flag

### Requirement: Threat actor HTTP routes

The plugin SHALL register three read routes gated on `capabilities.siem.argus_read`:

- `GET /internal/security_solution/argus/threat_actors` — paginated list, default sort by `actor_name`.
- `GET /internal/security_solution/argus/threat_actors/{actor_id}` — full actor document.
- `GET /internal/security_solution/argus/threat_actors/{actor_id}/coverage` — per-technique coverage split `{ technique_id, argus_authored, community_authored, redundant_rule_count }`.

#### Scenario: Unknown actor returns 404

- **WHEN** a GET request uses `actor_id=nope`
- **THEN** the response status MUST be `404`

#### Scenario: Actor coverage reflects corpus and recommendations

- **WHEN** an actor has three techniques: one covered only by Argus, one only by community, one by both
- **THEN** the `/coverage` response MUST include three entries with the corresponding booleans set correctly
- **AND** `source_counts` per technique MUST aggregate over `.soc-detection-corpus`

### Requirement: Actor coverage flyout in Argus Console

The Argus Console SHALL render an `ActorCoverageFlyout` when an actor is selected from the Actor list or via the URL deep-link `?actor_id=<id>`. The flyout MUST display, at minimum:

- Actor name, aliases, STIX type.
- Technique coverage table (technique id, tactic, Argus / community status).
- A link to download an ATT&CK Navigator layer for the actor's techniques.
- A "Run actor emulation" action that invokes the `soc-argus-playbook-apt-emulation` workflow with `{ actor_id }`.

The flyout MUST be composed on top of a generic `ArgusDetailFlyout` skeleton reused by the existing Mutation Detail flyout. Refactoring the Mutation Detail flyout to consume the skeleton MUST NOT change its behaviour.

#### Scenario: Flyout renders from actor list selection

- **WHEN** the user clicks an actor row in the Actor list panel
- **THEN** the flyout MUST open with the clicked actor selected
- **AND** the URL MUST update with `?actor_id=<id>`
- **AND** closing the flyout MUST clear `actor_id` from the URL

#### Scenario: Run emulation invokes the workflow

- **WHEN** the user clicks "Run actor emulation" in the flyout
- **THEN** the Console MUST POST to the workflow-run internal API for `soc-argus-playbook-apt-emulation` with `{ actor_id }`
- **AND** a toast MUST include the resulting `run_id` with a link to the Workflows UI
