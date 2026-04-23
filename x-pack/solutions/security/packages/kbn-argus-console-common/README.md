# @kbn/argus-console-common

Pure, isomorphic types, constants, and data-transformation builders shared
between the ARGUS Console browser surface (`@kbn/argus-console`) and the
Security Solution server routes that expose ARGUS's reasoning chain, mutation
lineage, governance pulse, coverage surfaces, playbooks, and decision graph.

This package must remain **framework-free** so it can safely live on both the
browser and server sides of the Security Solution plugin — no Elasticsearch
client, no Kibana Core, no React. Every value here is a type, a constant, or
a pure function over plain JSON documents.

## Contents

### `src/types/`

All ARGUS request / response contracts in a single place so the browser bundle
and the server route handlers can't drift:

- **Reasoning & lineage** — `ReasoningChain`, `ReasoningStep`,
  `MutationLineage`, `LineageNode`, `LineageEdge`, plus their reason-code
  enums.
- **Governance & mutations** — `ArgusMutationRow`, `ArgusMutationDetail`
  (with `ArgusMutationDetailCoverageDelta`, `ArgusMutationDetailPatternSeed`,
  and the full audit / gate / backtest sub-shapes), `ArgusMutationsResponse`,
  `ArgusMutationVerdictRequest` / `Response`, `GovernancePulse`,
  `ActivityEvent`, `TrustTier`.
- **End-to-end flow** — `ArgusE2dFlowResponse` and every `ArgusE2dStage`
  variant (ingested, exploit-probability, synthesized, evaluated, backtested,
  governance, applied, running).
- **Synthesis** — `ArgusSynthesisProposal`, `ArgusSynthesisResponse`,
  `ArgusSynthesisRecentResponse`, domination reason codes.
- **Coverage** — `ArgusCoverageSnapshot`, `ArgusCoverageCell`,
  `ArgusNavigatorLayer`, `ArgusThreatProfile`, `ArgusThreatActor`,
  `ArgusActorCoverage`, `ArgusCoverageGap`, `ArgusCoverageResponse`.
- **Playbooks** — `ArgusPlaybook`, `ArgusPlaybookKind`,
  `ArgusPlaybookUserIntent` (the canonical intent groups surfaced in the
  Playbooks tab), `ArgusPlaybookIndexResponse`.
- **Decision graph (Tier 5)** — `DecisionGraphNode`, `DecisionGraphEdge`,
  `DecisionGraphNodeKind`, `DecisionGraphRequest`, `DecisionGraphResponse`.
- **Caldera / kill-switch / autonomy** — `ArgusCalderaQueueResponse`,
  `ArgusKillSwitchResponse`, `ArgusAutonomyResponse`.

### `src/builders/`

Pure functions that transform raw `.soc-*` docs into the canonical response
payloads. Each builder is independently unit-tested and is consumed by the
matching Security Solution server route. Builders present today:

- `buildReasoningChainFromSpanDocs`
- `buildMutationLineageFromDocs`
- `buildGovernancePulse`
- `buildActivityFeed`
- `buildMutations`, `buildMutationDetail`
- `buildE2dFlow`
- `buildSynthesisProposals`, `buildRecentProposals`, `dominates`,
  `findDominator`
- `buildAutonomyDecisions`
- `buildCoverageGaps`
- `buildCalderaQueue`
- `buildKillSwitchState`
- `buildCoverageSnapshot`, `buildActorCoverage`, `buildNavigatorLayer`

### `src/constants.ts`

- **Route paths** — every internal `GET|POST /internal/security_solution/
  argus/...` route constant (reasoning, lineage, pulse, activity, mutations,
  mutation-detail, e2d-flow / recent-cves, synthesis / recent-proposals,
  autonomy-decisions, coverage-gaps, caldera-queue, kill-switch,
  mutation-verdict, coverage, threat-profiles, threat-actors,
  navigator-layer, redundancy-summary, autocomplete, quality-score-history,
  decision-graph, playbooks-index).
- **Capabilities** — `ARGUS_CONSOLE_READ_UI_CAPABILITY`,
  `ARGUS_CONSOLE_ALL_UI_CAPABILITY`, `ARGUS_WRITE_API_CAPABILITY`.
- **Index set** — `ARGUS_SOC_INDICES` with every `.soc-*` index the ARGUS
  Console depends on, including `.soc-detection-corpus`, `.soc-threat-actors`,
  `.soc-threat-profiles`, `.soc-coverage-gaps`, `.soc-audit-trail`,
  `.soc-kill-switch`, `.soc-autonomy-decisions`, `.soc-attack-commands`,
  `.soc-attack-profiles`, `.soc-difficulty-state`.
- **Tag constants** — `ARGUS_PLAYBOOK_TAG` (`"argus:playbook"`): the tag the
  Playbooks tab filters on.
- **Misc** — `KILL_SWITCH_DOC_ID`, `CANONICAL_STAGE_ORDER`.

## Why the types live here (and not in a dedicated read-api adapter)

The community-coverage-and-playbooks change keeps all ARGUS read contracts —
including the new Tier-5 decision-graph shapes — in this package. The
`@kbn/argus-read-api` adapter package + MCP/A2A switchover is a planned
follow-up once the decision graph has bedded in; until then, **this package
is the canonical source** for every ARGUS read contract.

## Sync note

The capability constants here are duplicated (with a sync comment) in
`x-pack/solutions/security/packages/features/src/constants.ts` to avoid a
circular dependency between the features package and the console-common
package. Any change to `ARGUS_CONSOLE_*_CAPABILITY` must be reflected in
both places.
