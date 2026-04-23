## ADDED Requirements

### Requirement: Coverage panel in Argus Console

The Argus Console SHALL render a `Coverage` panel as a tab beside the existing Pulse / Activity Feed / Mutation Lineage / Reasoning Drill-down tabs. The panel MUST display a tactic × technique heatmap where each cell's color encodes `argus_authored − community_authored` for that technique.

Cells MUST distinguish at minimum four states:

- `uncovered` — neither Argus nor any community source has a rule.
- `community_only` — only `.soc-detection-corpus` rules reference the technique.
- `argus_only` — only `.soc-recommendations` has a rule.
- `both` — both surfaces have coverage.

The panel MUST be gated on the `argusCoverageEnabled` experimental flag AND the existing `capabilities.siem.argus_read` capability.

#### Scenario: Flag off hides the tab

- **WHEN** `argusCoverageEnabled` is disabled
- **THEN** the Coverage tab MUST NOT appear in the Argus Console tab nav
- **AND** direct navigation to `/app/security/argus?panel=coverage` MUST fall back to the default tab

#### Scenario: Flag on renders the heatmap

- **WHEN** `argusCoverageEnabled` is enabled AND the user has `siem.argus_read`
- **THEN** the Coverage tab MUST render
- **AND** initial load MUST fetch `GET /internal/security_solution/argus/coverage` with no profile filter
- **AND** every technique returned MUST be rendered in its ATT&CK tactic column

### Requirement: Threat profile picker

The Coverage panel SHALL expose a threat-profile picker. Selecting a profile MUST narrow the heatmap to the techniques listed on that profile's `technique_ids[]`.

#### Scenario: Built-in profile narrows the heatmap

- **WHEN** the user selects the `ransomware` profile
- **THEN** the panel MUST issue `GET /internal/security_solution/argus/coverage?profile_id=ransomware`
- **AND** the rendered heatmap MUST exclude techniques not in the profile's `technique_ids[]`

#### Scenario: Profile selection is reflected in the URL

- **WHEN** the user selects a profile
- **THEN** the browser URL MUST update to `/app/security/argus?panel=coverage&profile_id=<id>` without a page reload
- **AND** loading that URL in a fresh session MUST restore the selection

### Requirement: Navigator layer export

The Coverage panel SHALL expose an "Export Navigator layer" action that produces a downloadable JSON compatible with the ATT&CK Navigator v4.5 `layer` schema. The export MUST reflect the current panel filter (profile or ad-hoc technique selection).

#### Scenario: Layer export includes current filter

- **WHEN** the user selects profile `apt29` and clicks Export Navigator layer
- **THEN** the export MUST contain only techniques in `apt29.technique_ids[]`
- **AND** each technique's color MUST reflect its `argus_authored` / `community_authored` state
- **AND** the filename MUST include the profile id

### Requirement: Run gap analysis action

The Coverage panel SHALL expose a "Run gap analysis" action that invokes the workflow `soc-argus-playbook-ransomware.yaml` (or the profile-specific playbook) for the currently-selected profile. The panel MUST NOT implement its own gap-analysis logic — the invocation MUST route through the workflows internal API.

After invocation, the panel MUST poll `.soc-mutation-intents` for new documents with `argus.origin: 'gap_analysis'` produced in the last five minutes and surface a banner listing them.

#### Scenario: Gap analysis triggers a workflow run

- **WHEN** the user selects profile `ransomware` and clicks Run gap analysis
- **THEN** the panel MUST POST to the workflow-run internal API with the workflow id corresponding to `soc-argus-playbook-ransomware`
- **AND** the request payload MUST include `{ profile_id: 'ransomware' }`
- **AND** on success, a toast MUST display the `run_id` with a link to the Workflows UI

#### Scenario: Produced mutation intents surface in the banner

- **WHEN** a gap-analysis run has completed
- **AND** it has produced documents in `.soc-mutation-intents` with `argus.origin: 'gap_analysis'` within the last five minutes
- **THEN** the Coverage panel MUST display a dismissible banner listing those intent IDs
- **AND** each listed intent MUST deep-link to the Mutation Detail flyout with that intent selected

### Requirement: Backend coverage route

The plugin SHALL register `GET /internal/security_solution/argus/coverage` gated on `capabilities.siem.argus_read`. The route MUST accept optional query params `profile_id` and `actor_id` and MUST respond with a JSON envelope shaped like `ArgusCoverageSnapshot`:

```
{
  total: number,
  argus_only: number,
  community_only: number,
  both: number,
  uncovered: number,
  techniques: Array<{
    technique_id: string,
    tactic: string,
    argus_authored: boolean,
    community_authored: boolean,
    source_counts: Record<string, number>,
  }>,
  profile_id?: string,
  actor_id?: string,
  computed_at: string,
}
```

#### Scenario: Missing privilege returns 403

- **WHEN** a request is made without `capabilities.siem.argus_read`
- **THEN** the response status MUST be `403`

#### Scenario: Invalid profile id returns 400

- **WHEN** the query includes `profile_id=not-a-real-profile`
- **THEN** the response status MUST be `400`
- **AND** the response body MUST reference the offending field

### Requirement: Deep-link URL params

The Argus Console SHALL extend its URL query-param contract with `panel=coverage|playbooks|…`, `profile_id=<id>`, and `actor_id=<id>`. When `panel=coverage` is present, the Coverage tab MUST be initially active.

#### Scenario: Deep-link opens Coverage with actor pre-selected

- **WHEN** the user navigates to `/app/security/argus?panel=coverage&actor_id=apt29`
- **THEN** the Coverage tab MUST be the active tab
- **AND** the Actor-selection surface MUST show `apt29` as the current actor
- **AND** the coverage route MUST be called with `actor_id=apt29`
