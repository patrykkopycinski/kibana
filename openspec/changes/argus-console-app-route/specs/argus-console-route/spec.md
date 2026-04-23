## ADDED Requirements

### Requirement: Argus deep-link registration

The Security Solution plugin SHALL register a deep-link at path `/argus` (i.e. `/app/security/argus`) behind the `argusConsoleEnabled` experimental feature flag. The deep-link MUST appear in the `appLinks` array in `public/app/links/app_links.ts` and MUST be filtered out of `getFilteredLinks` when the flag is off.

#### Scenario: Flag off hides the route

- **WHEN** `argusConsoleEnabled` is not enabled in `xpack.securitySolution.enableExperimental`
- **THEN** `getFilteredLinks` MUST NOT include `argusLinks`
- **AND** navigating to `/app/security/argus` MUST resolve to the Security Solution default not-found route

#### Scenario: Flag on exposes the route

- **WHEN** `argusConsoleEnabled` is enabled AND the user has `capabilities.siem.argus_read`
- **THEN** `getFilteredLinks` MUST include `argusLinks`
- **AND** navigating to `/app/security/argus` MUST render the `<ArgusConsole />` component from `@kbn/argus-console`

### Requirement: `argus` sub-privilege

The Security Solution Kibana feature SHALL declare an `argus` sub-feature with exactly two actions: `read` and `all`. The sub-feature registration MUST produce two boolean capabilities under `capabilities.siem`: `argus_read` and `argus_all`.

#### Scenario: Read privilege derives read capability

- **WHEN** a user is granted the `argus:read` sub-feature privilege
- **THEN** `capabilities.siem.argus_read` MUST be `true`
- **AND** `capabilities.siem.argus_all` MUST be `false`

#### Scenario: All privilege derives both capabilities

- **WHEN** a user is granted the `argus:all` sub-feature privilege
- **THEN** both `capabilities.siem.argus_read` AND `capabilities.siem.argus_all` MUST be `true`

### Requirement: Deep-link gated on read capability

The `argusLinks` `LinkItem` SHALL declare `capabilities: [['siem.argus_read']]` so that users without `argus:read` do not see the nav entry.

#### Scenario: Missing capability hides the nav entry

- **WHEN** the flag is on AND the user's `capabilities.siem.argus_read` is `false`
- **THEN** the nav entry for Argus MUST NOT render

### Requirement: Internal data routes

The plugin SHALL register two internal HTTP routes, both gated on `capabilities.siem.argus_read` via `security.authz.requiredPrivileges`:

- `POST /internal/security_solution/argus/reasoning_chain`
- `POST /internal/security_solution/argus/mutation_lineage`

Both routes accept a body of shape `{ subject_kind: 'alert' | 'run' | 'rule', subject_id: string }` validated by `@kbn/config-schema`. Responses MUST be JSON envelopes matching the builder return types (`ReasoningChainBuildResult`, `MutationLineageBuildResult`).

#### Scenario: Missing privilege returns 403

- **WHEN** a request to either route is made without `capabilities.siem.argus_read`
- **THEN** the response status MUST be `403`

#### Scenario: Invalid subject_kind returns 400

- **WHEN** a request body has `subject_kind` outside the allowed enum
- **THEN** the response status MUST be `400`
- **AND** the response body MUST identify the offending field

### Requirement: URL deep-link params

When the route loads with query params `?subject_kind=<kind>&subject_id=<id>`, the `ArgusConsole` root SHALL pre-select either the Lineage or Reasoning tab and pass the subject through to the panel.

#### Scenario: Alert subject opens the reasoning tab

- **WHEN** the user navigates to `/app/security/argus?subject_kind=alert&subject_id=abc123`
- **THEN** the Reasoning drill-down tab MUST be the initially-active tab
- **AND** the panel MUST fire `useReasoningChain({ subject_kind: 'alert', subject_id: 'abc123' })`

#### Scenario: Rule subject opens the lineage tab

- **WHEN** the user navigates to `/app/security/argus?subject_kind=rule&subject_id=mythos.x`
- **THEN** the Mutation Lineage tab MUST be the initially-active tab
- **AND** the panel MUST fire `useMutationLineage({ subject_kind: 'rule', subject_id: 'mythos.x' })`
