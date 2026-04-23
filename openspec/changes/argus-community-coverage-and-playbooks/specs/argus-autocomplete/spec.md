## ADDED Requirements

### Requirement: Unified autocomplete HTTP route

The Security Solution plugin SHALL expose `GET /internal/security_solution/argus/autocomplete` accepting query parameters `kind`, `q`, and optional `limit`. The route MUST dispatch on `kind` to the correct source index and return a uniform response envelope.

- `kind` MUST be one of `technique | cve | process | actor | data_source`
- `limit` MUST default to `10` and MUST NOT exceed `25`
- `q` MUST be a string; for `kind in {technique, cve, process}` `q.length >= 2` is required, otherwise the route MUST return an empty result set without dispatching
- The response MUST be `{ results: Array<{ id: string, label: string, context?: Record<string, unknown> }> }`
- The route MUST be gated on `capabilities.siem.argus_read`

#### Scenario: Unknown kind is rejected at validation

- **WHEN** a client sends `?kind=foo&q=bar`
- **THEN** the route MUST fail validation with a 400-equivalent error
- **AND** the error MUST list the supported kinds

#### Scenario: Short query for a gated kind returns empty

- **WHEN** a client sends `?kind=technique&q=a`
- **THEN** the route MUST return `{ results: [] }` without querying any index
- **AND** MUST NOT surface an error

#### Scenario: Limit is clamped

- **WHEN** a client sends `?kind=cve&q=CVE-2024&limit=999`
- **THEN** the route MUST respond with at most 25 results
- **AND** the result set MUST be the top 25 by the kind-specific relevance ranking

### Requirement: Per-kind dispatch semantics

The autocomplete route MUST resolve each `kind` against the correct backing source:

- `technique` MUST resolve against the built-in ATT&CK technique catalogue (static list shipped with the plugin) joined with `.soc-threat-actors[*].techniques[]` for aliasing; `label` MUST be `"<technique_id> — <name>"`; `context` MUST include `{ tactics: string[] }`
- `cve` MUST resolve against `.soc-cve-advisories`; `label` MUST be `cve_id`; `context` MUST include `{ title, cvss_score?, kev?: boolean }`
- `process` MUST resolve against `logs-endpoint.events.process-*` and `.alerts-security.alerts-*` (top-N terms on `process.name.keyword`); `label` MUST be `process.name`; `context` MUST include `{ occurrence_count }`
- `actor` MUST resolve against `.soc-threat-actors`; `label` MUST be `actor_name`; `context` MUST include `{ aliases: string[], technique_count: number }`
- `data_source` MUST resolve against a static enum (`endpoint, network, identity, cloud, email, dns, tls`); `label` MUST be the human-readable name; `context` MUST include `{ description: string }`

#### Scenario: Actor autocomplete includes aliases

- **GIVEN** `.soc-threat-actors` contains an actor with `actor_name: "APT29"` and `aliases: ["Cozy Bear", "Midnight Blizzard"]`
- **WHEN** a client sends `?kind=actor&q=midnight`
- **THEN** the actor MUST appear in the results
- **AND** `context.aliases` MUST include `"Midnight Blizzard"`

### Requirement: Shared combo-box components in `@kbn/argus-console`

The `@kbn/argus-console` package SHALL export five shared combo-box components under `src/components/combo_boxes/`:

- `<TechniqueCombo />`
- `<CveCombo />`
- `<ProcessNameCombo />`
- `<ActorCombo />`
- `<DataSourceCombo />`

Each component MUST wrap `@elastic/eui`'s `EuiComboBox` with async loading backed by the autocomplete route and MUST:

- Debounce user input at 200ms
- Enforce the per-kind minimum query length matching the route contract
- Render `context` in the option's secondary line (kind-specific formatting)
- Expose a uniform `{ value, onChange, placeholder?, compressed? }` prop contract
- Share a single `useAutocomplete(kind, query)` hook to eliminate per-component HTTP glue

#### Scenario: Components reuse the shared hook

- **WHEN** any combo-box is mounted
- **THEN** it MUST resolve its options through `useAutocomplete`
- **AND** MUST NOT duplicate HTTP request logic inline

#### Scenario: Changing input re-fires a debounced request

- **WHEN** the user types three characters into `<CveCombo />` within 200ms
- **THEN** exactly one HTTP request MUST be issued with `q` equal to the final typed value

### Requirement: Combo-boxes replace freeform inputs across existing Argus surfaces

The following Console surfaces MUST use the shared combo-boxes rather than freeform text inputs:

- Mutations panel filters (technique, CVE, process-name filters)
- Coverage panel profile/actor/technique pickers (where applicable)
- Skill launcher parameter form (for any parameter typed as one of the autocomplete kinds)

#### Scenario: Filtering Mutations by technique uses canonical IDs

- **WHEN** the user opens the technique filter in the Mutations panel
- **THEN** the filter MUST render as a `<TechniqueCombo />`
- **AND** the filter value emitted to the backend MUST be the canonical `technique_id` string

### Requirement: `argus_autocomplete_tool` for agent-builder

An Agent Builder tool `argus_autocomplete_tool` SHALL be registered that accepts `{ kind, q, limit? }` and returns the same envelope as the HTTP route. The tool MUST call the route via the server-side internal HTTP client and MUST NOT re-implement dispatch logic.

#### Scenario: LLM skill resolves fuzzy user input

- **GIVEN** a skill handler receives the phrase "cozy bear techniques"
- **WHEN** the handler invokes `argus_autocomplete_tool` with `{ kind: 'actor', q: 'cozy bear' }`
- **THEN** the response MUST include APT29
- **AND** the handler MUST be able to pass APT29's `actor_id` to downstream Argus tools
