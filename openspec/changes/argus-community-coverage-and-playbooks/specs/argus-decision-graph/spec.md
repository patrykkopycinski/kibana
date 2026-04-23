## ADDED Requirements

### Requirement: `.soc-decision-graph` edge index

A new index `.soc-decision-graph` SHALL hold materialised edge documents representing relationships between Argus entities (advisories, mutation intents, outcomes, rules, actors, techniques, reasoning traces, audit records). The index template MUST include:

- `edge_id: keyword` (primary, deterministic)
- `from_kind: keyword`, `from_id: keyword`
- `to_kind: keyword`, `to_id: keyword`
- `relation: keyword` (e.g. `produced_by | applied_as | observed_as | attributed_to | covers | references | reasoned_over`)
- `evidence_ts: date`
- `strength: float` (0..1)
- `provenance: { source_index: keyword, source_doc_id: keyword }`

`edge_id` MUST be deterministic (hash of `from_kind:from_id:to_kind:to_id:relation`) so the builder workflow is idempotent under re-run.

The `from_kind` and `to_kind` vocabulary MUST include at least: `advisory | intent | outcome | rule | actor | technique | observation | reasoning_trace | audit`.

#### Scenario: Re-running the builder is idempotent

- **GIVEN** `soc-argus-decision-graph-builder.yaml` has run once and produced N edges
- **WHEN** it runs a second time with no new source data
- **THEN** the index MUST still contain exactly N edges
- **AND** no duplicate `edge_id` values MUST be present

### Requirement: `@kbn/argus-decision-graph` package

A new `shared-common` package `@kbn/argus-decision-graph` SHALL live at `x-pack/solutions/security/packages/kbn-argus-decision-graph/`. The package MUST export:

- One edge builder per source → target type in `src/edges/`, each a pure function `buildEdges(rawDocs): EdgeDoc[]`
- A central registry `EDGE_SOURCES` enumerating every source kind + its builder, so the scheduled workflow iterates the registry rather than hard-coding source handling
- A neighborhood query helper `queryNeighborhood({ rootKind, rootId, depth })` that returns `{ nodes, edges }`, capped at `depth <= 3` and `<= 200 nodes`

Every edge builder MUST be unit-tested against fixture source documents.

#### Scenario: Adding a new source is one registration call

- **GIVEN** a new `.soc-x` index is introduced that should contribute edges
- **WHEN** the contributor adds `src/edges/x_to_*.ts` and registers it in `EDGE_SOURCES`
- **THEN** the scheduled builder workflow MUST pick up the new source automatically on its next run
- **AND** no change to the workflow YAML MUST be required beyond existing configuration

### Requirement: Scheduled builder workflow

The system SHALL ship a scheduled Kibana Workflow `soc-simulation/workflows/soc-argus-decision-graph-builder.yaml` that runs hourly and can be re-run ad-hoc from the Workflows UI. The workflow MUST:

- Iterate every entry in `EDGE_SOURCES`
- For each source, scan recent source-index documents (default last 2h, configurable input `lookback_hours`)
- Call the registered edge builder and bulk-write edges to `.soc-decision-graph` with `op_type: create` keyed on `edge_id`
- Declare `metadata.tags: [argus, argus:scheduled]` (NOT `argus:playbook`)
- Emit a per-run summary doc to `.soc-audit-trail` with `{ kind: 'decision_graph_build', run_id, source_counts, new_edges, duration_ms }`

#### Scenario: Hourly run adds only new edges

- **GIVEN** the previous run completed at T with N edges in the index
- **WHEN** the hourly run fires at T+1h with 5 new source docs
- **THEN** the index MUST contain N + k edges, where k is the count of edges produced by the 5 new docs
- **AND** edges that already existed MUST NOT be re-written

### Requirement: Decision-graph read route

The Security Solution plugin SHALL expose `GET /internal/security_solution/argus/decision_graph?root_kind=&root_id=&depth=` that returns the neighborhood around `(root_kind, root_id)` to a maximum `depth` of 3 and maximum 200 nodes. The route MUST:

- Be gated on `capabilities.siem.argus_read`
- Import its request/response types from `@kbn/argus-console-common` (the existing shared-common package used by every other Argus read route)
- Return `{ nodes: Array<{ kind, id, label }>, edges: Array<{ from: NodeRef, to: NodeRef, relation, evidence_ts, strength }> }`
- Be cycle-safe (MUST NOT loop on self-referential edges)
- Clamp `depth` to `[1, 3]` at validation
- Cap node count at 200 and indicate truncation via a `truncated: boolean` top-level field

#### Scenario: Depth out of range is clamped

- **WHEN** a client sends `?root_kind=intent&root_id=abc&depth=10`
- **THEN** validation MUST reject the request with a 400-equivalent error
- **AND** the error message MUST state the valid `depth` range

#### Scenario: Neighborhood exceeds node cap

- **GIVEN** a root whose 2-hop neighborhood has 500 nodes
- **WHEN** the route is called with `depth=2`
- **THEN** the response MUST contain at most 200 nodes
- **AND** `truncated` MUST be `true`

### Requirement: Console decision-graph flyout

The Reasoning Drill-down panel in `@kbn/argus-console` SHALL gain a "Show decision graph" `EuiButton` that, when clicked, opens a `DecisionGraphFlyout`. The flyout MUST:

- Fetch the neighborhood via the decision-graph route with `root_kind=intent, root_id=<current mutation_intent_id>, depth=2`
- Render `{ nodes, edges }` using the existing `LineageGraph` primitive (shared with the Mutation Lineage panel — MUST NOT fork the primitive)
- Colour nodes by `kind` (advisory/intent/outcome/rule/actor/technique) using tokens from the existing Argus palette
- Label edges by `relation`
- Show a "Truncated" banner when the response sets `truncated: true`
- Provide a "Re-run builder" secondary action that invokes the builder workflow ad-hoc (gated behind `capabilities.siem.argus_all`)

#### Scenario: Button is hidden when the feature flag is off

- **GIVEN** `argusDecisionGraphEnabled` is `false`
- **WHEN** the Reasoning Drill-down panel renders for any mutation intent
- **THEN** the "Show decision graph" button MUST NOT appear
- **AND** the read route MUST still respond successfully to direct HTTP calls (only UI is gated)

#### Scenario: Neighborhood renders with coloured nodes

- **GIVEN** an intent with 1-hop neighbors `{ advisory, outcome, rule }`
- **WHEN** the flyout opens
- **THEN** three distinct node colours MUST appear (one per kind)
- **AND** each edge MUST be labelled with its `relation`

### Requirement: Deep-link support

The Argus Console route MUST accept URL parameters `?panel=reasoning&decision_graph=<root_kind>:<root_id>&depth=<n>` that open the Reasoning Drill-down panel and immediately open the decision-graph flyout pre-loaded with the specified neighborhood.

#### Scenario: Agent-builder deep-links from a chat response

- **WHEN** an agent-builder chat emits a link of the form `/app/security/argus?panel=reasoning&decision_graph=intent:abc123&depth=2`
- **AND** the user clicks the link
- **THEN** the Console MUST land on the Reasoning Drill-down panel for intent `abc123`
- **AND** the decision-graph flyout MUST be open with the 2-hop neighborhood loaded

### Requirement: Agent-builder tool

An Agent Builder tool `argus_get_decision_graph_tool` MUST be registered that accepts `{ root_kind, root_id, depth? }` and returns the same response shape as the HTTP route. The tool MUST reuse the response type exported from `@kbn/argus-console-common` and MUST delegate to the route via the internal HTTP client rather than re-implementing the neighborhood query.

#### Scenario: Skill uses the tool to enrich an explanation

- **GIVEN** `argus_explain_decision` is invoked with `include_decision_graph: true`
- **WHEN** the skill handler runs
- **THEN** it MUST call `argus_get_decision_graph_tool` for the current intent
- **AND** MUST embed a compact summary of the returned neighborhood in the explanation text

### Requirement: Demo seeder

A CLI `scripts/argus_seed_decision_graph.js` MUST write a representative edge set (advisory → intent → outcome → rule, plus actor → technique → intent) so the flyout renders immediately in demo installs without waiting for the scheduled builder. The seeder MUST be idempotent and MUST use the same edge-construction helpers from `@kbn/argus-decision-graph` as the production builder.

#### Scenario: Seeded demo has non-trivial neighborhoods

- **WHEN** `argus_seed_decision_graph.js` runs on a clean cluster
- **THEN** at least one demo intent MUST have a 2-hop neighborhood of ≥ 5 nodes
- **AND** the flyout MUST render coloured nodes spanning at least four distinct kinds

### Requirement: Decision Graph explorer panel

The Argus Console SHALL expose a full-screen **Decision Graph** panel registered under `?panel=decision_graph`, in addition to the Reasoning Drill-down flyout. The panel MUST:

- Be gated on `argusDecisionGraphEnabled` (same flag as the flyout) and on `capabilities.siem.argus_read`
- Call the existing `GET /internal/security_solution/argus/decision_graph` route — MUST NOT introduce a second server-side traversal endpoint
- Render the returned `{ nodes, edges }` via the same `LineageGraph` primitive the flyout uses, in a canvas-sized container (fills the Console content area minus chrome), with identical colour-by-kind and label-by-relation conventions
- Expose a root selector (kind + id) and a depth selector (1..3) that re-issue the read route on change; initial values come from URL params
- Be reachable in three ways: (a) direct URL, (b) a primary-navigation entry in the Argus Console panel menu, (c) an "Open in explorer" secondary action on the existing "Show decision graph" flyout that carries the current root forward
- Show a "Truncated" banner when the response sets `truncated: true`, identical to the flyout

#### Scenario: Opening the explorer from the flyout preserves the root

- **GIVEN** the Reasoning Drill-down flyout is open for mutation intent `abc123` at `depth=2`
- **WHEN** the user clicks "Open in explorer"
- **THEN** the Console MUST navigate to `?panel=decision_graph&root_kind=intent&root_id=abc123&depth=2`
- **AND** the explorer MUST render the same neighborhood without issuing a second request if the payload is already cached for that key

#### Scenario: Feature flag hides the panel entry

- **GIVEN** `argusDecisionGraphEnabled` is `false`
- **WHEN** the Console panel menu renders
- **THEN** the Decision Graph entry MUST NOT appear
- **AND** navigating directly to `?panel=decision_graph` MUST render the default Argus Console panel instead

### Requirement: Explorer filtering

The Decision Graph explorer panel SHALL provide a `DecisionGraphFilters` sub-component that filters the currently-loaded neighborhood client-side (without re-issuing the route). The filter MUST support:

- Filter by `node.kind` (multi-select over `advisory | intent | outcome | rule | actor | technique | observation | reasoning_trace | audit`)
- Filter by `edge.relation` (multi-select)
- Filter by `evidence_ts` time window (relative: `last 24h | last 7d | last 30d | all`)
- Filter by `edge.strength` threshold (slider `0..1`, default `0`)
- A "Reset filters" action

Filtered-out nodes MUST be hidden together with any edges that reference them, so the rendered graph stays valid (no dangling edges). An empty filter MUST show the full neighborhood.

Active filters MUST be serialised into the URL under `filter_kinds=`, `filter_relations=`, `filter_time=`, `filter_strength=` so a filtered view is shareable.

#### Scenario: Filtering by kind hides edges with filtered endpoints

- **GIVEN** a loaded neighborhood with kinds `{advisory, intent, outcome, rule}`
- **WHEN** the user unchecks `advisory` in the kind filter
- **THEN** no node with `kind: 'advisory'` MUST be rendered
- **AND** no edge whose `from` or `to` kind is `advisory` MUST be rendered
- **AND** the URL MUST reflect `filter_kinds=intent,outcome,rule`

#### Scenario: Filters do not re-issue the server request

- **GIVEN** the explorer has loaded a neighborhood at `depth=2`
- **WHEN** the user toggles any client-side filter
- **THEN** no new request to `GET /internal/security_solution/argus/decision_graph` MUST be made

### Requirement: Explorer pathfinding

The Decision Graph explorer panel SHALL provide a `DecisionGraphPathfinder` sub-component that highlights the shortest edge path between two selected nodes in the currently-loaded neighborhood. The pathfinder MUST:

- Allow the user to pick a source node and a target node by clicking nodes in the graph OR by selecting from a typeahead over loaded nodes
- Compute the shortest path by BFS over the loaded node/edge set, treating edges as undirected
- Highlight the path in the rendered graph (path nodes + path edges visually distinguished from non-path ones) and list the path as an ordered `NodeRef[]` in a side-panel
- Show a clear empty-state message when no path exists within the loaded neighborhood
- Support URL params `path_from=<kind>:<id>` and `path_to=<kind>:<id>` so a pathfinding view is reproducible

#### Scenario: Shortest path highlights the correct edge chain

- **GIVEN** a loaded neighborhood where `intent:A → outcome:B → rule:C` is the only edge chain from `intent:A` to `rule:C`
- **WHEN** the user sets `path_from=intent:A` and `path_to=rule:C`
- **THEN** the pathfinder MUST highlight exactly nodes `{intent:A, outcome:B, rule:C}` and the two edges between them
- **AND** the ordered path MUST be `[intent:A, outcome:B, rule:C]`

#### Scenario: No path within the loaded window

- **GIVEN** a loaded neighborhood that does not contain the target node
- **WHEN** the user sets `path_to=<unknown>`
- **THEN** the pathfinder MUST render an empty-state message explaining that the target is outside the current window
- **AND** suggest changing the root or increasing depth

### Requirement: Explorer export

The Decision Graph explorer panel SHALL provide a `DecisionGraphExportMenu` with two export actions:

- **Export JSON** — downloads the raw neighborhood payload currently displayed (post-filter, so exported data matches the visible graph) as `decision_graph_<root_kind>_<root_id>_<timestamp>.json`
- **Export SVG** — takes a snapshot of the `LineageGraph`'s rendered SVG (including any pathfinding highlights) and downloads it as `decision_graph_<root_kind>_<root_id>_<timestamp>.svg`

Both actions MUST run entirely client-side. Neither MUST introduce a new server route. The exported JSON MUST validate against the `DecisionGraphResponse` type exported from `@kbn/argus-console-common`.

#### Scenario: JSON export matches the filtered view

- **GIVEN** the explorer has loaded a 10-node neighborhood and the user has filtered to 4 visible nodes
- **WHEN** the user clicks "Export JSON"
- **THEN** the downloaded file MUST contain exactly those 4 nodes and the edges between them
- **AND** the file MUST validate against `DecisionGraphResponse`

#### Scenario: SVG export reflects pathfinding highlights

- **GIVEN** the pathfinder is active with a highlighted path
- **WHEN** the user clicks "Export SVG"
- **THEN** the downloaded SVG MUST include the same visual highlights applied in the rendered graph

### Requirement: Explorer deep-link parameters

The Argus Console route MUST accept URL parameters `?panel=decision_graph&root_kind=<kind>&root_id=<id>&depth=<n>&filter_kinds=<csv>&filter_relations=<csv>&filter_time=<token>&filter_strength=<n>&path_from=<kind>:<id>&path_to=<kind>:<id>` such that any combination fully reconstructs the explorer state on load.

All parameters except `panel`, `root_kind`, and `root_id` MUST be optional. Unknown or malformed parameter values MUST be ignored silently (the explorer MUST still render with defaults).

#### Scenario: A shared explorer URL reproduces the view

- **GIVEN** an operator has filtered the explorer and selected a path
- **WHEN** the operator copies the current URL and a colleague opens it
- **THEN** the colleague's explorer MUST land on the same root, same depth, same filter set, and same highlighted path without further interaction
