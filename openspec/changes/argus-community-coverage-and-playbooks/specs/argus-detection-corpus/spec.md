## ADDED Requirements

### Requirement: Unified community detection corpus index

The system SHALL maintain an Elasticsearch index `.soc-detection-corpus` holding community detections normalized across at least six source formats: Sigma, Splunk ESCU, Elastic Rules, Sublime MQL, KQL markdown, and CrowdStrike CQL.

Each document MUST carry the following canonical fields:

- `rule_id: keyword` — stable ID unique across sources (sha1 of `source + native_id`).
- `source: keyword` — one of `sigma | splunk_escu | elastic | sublime | kql_md | crowdstrike_cql`.
- `native_id: keyword` — the upstream repo's own identifier.
- `title: text` + `title.keyword` — rule title.
- `description: text` — optional.
- `mitre_technique: keyword` — array of ATT&CK technique IDs (`T1059.001`, etc.).
- `data_sources: keyword` — array of ATT&CK data-source IDs.
- `raw_query: text` — verbatim upstream query / rule body.
- `language: keyword` — query language tag (`sigma`, `spl`, `eql`, `kql`, `mql`, `cql`).
- `authored_at: date` / `last_modified: date`.
- `provenance_url: keyword` — upstream URL.
- `ingested_at: date`.

Documents that fail validation SHALL be written to `.soc-dead-letter` with `{ source, native_id, reason }` and MUST NOT block the remaining batch.

#### Scenario: Heterogeneous sources produce canonical documents

- **WHEN** the ingest CLI processes fixtures from all six supported sources
- **THEN** every resulting document in `.soc-detection-corpus` MUST carry all canonical fields declared above
- **AND** `rule_id` MUST be stable across repeated ingests of the same upstream rule

#### Scenario: Malformed rules are dead-lettered without aborting ingest

- **WHEN** an upstream file contains a malformed rule (missing required field, unparseable YAML/JSON)
- **THEN** a document MUST be written to `.soc-dead-letter` with `source`, `native_id` (if recoverable) or a content-hash placeholder, and a human-readable `reason`
- **AND** the ingest run MUST continue and MUST complete with a non-zero dead-lettered count reported by the CLI

### Requirement: `@kbn/argus-corpus-ingest` package

The system SHALL provide a `shared-common` Kibana package `@kbn/argus-corpus-ingest` under `x-pack/solutions/security/packages/kbn-argus-corpus-ingest/` that exports:

- `parse(contents: string, source: SourceTag, meta: SourceMeta): CorpusRule[]` per supported source format, via `src/parsers/<source>.ts`.
- `normalize(rule: CorpusRule): CanonicalDoc` producing the canonical index shape.
- A CLI entrypoint `src/cli/ingest.ts` that takes a `sources.yaml` (repo URL + format tag), clones/updates each repo into a working directory, runs the appropriate parser, and bulk-indexes to `.soc-detection-corpus`.

#### Scenario: Per-source parser exports exist

- **WHEN** the package is built
- **THEN** `src/parsers/` MUST include modules for `sigma`, `splunk_escu`, `elastic`, `sublime`, `kql_md`, and `crowdstrike_cql`
- **AND** each module MUST export a `parse` function returning `CorpusRule[]`

#### Scenario: CLI is invokable via the Kibana script pattern

- **WHEN** the user runs `node scripts/argus_ingest_corpus.js --config <path>`
- **THEN** the CLI MUST execute under `@kbn/setup-node-env`, MUST log via `ToolingLog`, MUST honor `--kibana-url`, `--username`, `--password` overrides, and MUST exit non-zero if any source fully fails to parse

### Requirement: Idempotent ingest

Re-running corpus ingest against an unchanged upstream MUST produce zero net document changes (same `rule_id`, same normalized body → no write or a no-op update).

#### Scenario: Re-ingest is a no-op

- **WHEN** corpus ingest is run twice consecutively against the same upstream state
- **THEN** the second run MUST NOT create new `rule_id` documents
- **AND** the second run SHOULD report `updated: 0, created: 0, dead_lettered: 0` (or equivalent)

### Requirement: Index template registration

An Elasticsearch composable index template for `.soc-detection-corpus` MUST be registered following the existing `.soc-*` template conventions, including mappings for the canonical fields and an ILM policy consistent with the pattern used for `.soc-recommendations`.

#### Scenario: Template is applied on first write

- **WHEN** the ingest CLI writes its first document and no pre-existing index exists
- **THEN** the resulting index MUST carry the registered mapping
- **AND** `mitre_technique`, `data_sources`, `source`, `language` MUST be `keyword` fields usable for aggregations

### Requirement: Demo subset seeder

The system SHALL provide `scripts/argus_seed_coverage_demo.js` that populates `.soc-detection-corpus` with a representative subset (≥ 50 rules spanning at least five of the six supported sources) suitable for running the Console Coverage panel without a full ingest.

#### Scenario: Demo seeder yields a non-empty heatmap

- **WHEN** `scripts/argus_seed_coverage_demo.js` is run on an empty cluster
- **THEN** `.soc-detection-corpus` MUST contain at least 50 documents
- **AND** rules MUST span at least five distinct values of `source`
- **AND** rules MUST cover at least 10 distinct `mitre_technique` values
