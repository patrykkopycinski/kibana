## ADDED Requirements

### Requirement: Playbooks tab in Argus Console

The Argus Console SHALL render a `Playbooks` tab alongside the existing tabs. The tab MUST be visible whenever `argusConsoleEnabled` is on and the user has `capabilities.siem.argus_read`; it MUST NOT depend on `argusCoverageEnabled`.

The tab MUST contain exactly two widgets:

1. `WorkflowRunsWidget` — a listing of workflows tagged `argus:playbook` with their recent runs.
2. `SkillLauncherWidget` — a listing of agent-builder skills tagged `argus:playbook`.

Both widgets MUST discover their contents exclusively by tag. No hard-coded playbook IDs MUST appear in UI code.

#### Scenario: Adding a new playbook requires no Console code change

- **WHEN** a new workflow YAML is added under `soc-simulation/workflows/` with `metadata.tags` including `argus:playbook`
- **AND** the Argus Console is reloaded
- **THEN** the `WorkflowRunsWidget` MUST include the new workflow without any edits to `@kbn/argus-console`

- **WHEN** a new skill is registered in `register_skills.ts` with `metadata.tags` including `argus:playbook`
- **AND** the Argus Console is reloaded
- **THEN** the `SkillLauncherWidget` MUST include the new skill without any edits to `@kbn/argus-console`

### Requirement: Workflow Runs Widget

`WorkflowRunsWidget` MUST embed the existing Kibana Workflows management UI (via the `embeddable` plugin or equivalent) scoped to tag `argus:playbook`. The widget MUST surface at minimum, per workflow:

- Workflow name and tags.
- Last run status and completion time.
- A "Run" action that deep-links to the Workflows UI pre-filled for a fresh invocation.

#### Scenario: Run action hands off to the Workflows UI

- **WHEN** the user clicks `Run` on a workflow in the widget
- **THEN** the Argus Console MUST navigate to the Workflows management UI with the workflow pre-selected and pre-filled inputs (empty or defaulted)
- **AND** the console MUST NOT attempt to execute the workflow inline

#### Scenario: Filtering is enforced by tag

- **WHEN** the widget loads
- **THEN** only workflows whose `metadata.tags` include `argus:playbook` MUST be visible
- **AND** untagged workflows MUST NOT appear regardless of naming

### Requirement: Skill Launcher Widget

`SkillLauncherWidget` MUST query the agent-builder skills registry for skills tagged `argus:playbook` and render them as a card grid. Clicking a card MUST either:

- open the agent-builder chat with the skill pre-selected, OR
- when the agent-builder UI deep-link is unavailable in the host environment, open a local skill-invocation flyout that lets the user fill the skill's input schema and invokes the skill via the agent-builder internal API.

#### Scenario: Pre-selected skill in agent-builder chat

- **WHEN** the user clicks the `argus_assess_readiness` card
- **AND** the agent-builder UI deep-link is available
- **THEN** the host MUST navigate to the agent-builder chat with `argus_assess_readiness` pre-selected as the active skill

#### Scenario: Fallback flyout for skill invocation

- **WHEN** the user clicks a skill card in an environment where the agent-builder UI deep-link is unavailable
- **THEN** a flyout MUST open rendering the skill's zod input schema as a form
- **AND** submitting the form MUST invoke the skill via the agent-builder internal API
- **AND** the flyout MUST display the skill's result when the invocation completes

### Requirement: Deep-link URL param

The Argus Console SHALL accept `?panel=playbooks` on its route. When present, the Playbooks tab MUST be the initially active tab.

#### Scenario: Deep-link opens Playbooks tab

- **WHEN** the user navigates to `/app/security/argus?panel=playbooks`
- **THEN** the Playbooks tab MUST be the active tab immediately on mount
- **AND** the Coverage / Pulse / Activity Feed / Mutation Lineage / Reasoning tabs MUST NOT be preferentially loaded

### Requirement: Empty-state guidance

When zero workflows carry the `argus:playbook` tag, the `WorkflowRunsWidget` MUST render an empty state directing operators to tag an existing workflow or create a new one. The guidance MUST reference the `argus:playbook` tag explicitly.

When zero skills carry the `argus:playbook` tag, the `SkillLauncherWidget` MUST render an empty state directing operators to register a skill with the tag.

#### Scenario: Empty-state copy names the tag

- **WHEN** no `argus:playbook` workflows exist in the installation
- **THEN** the widget MUST render guidance mentioning `argus:playbook`
- **AND** MUST NOT render an empty table header
