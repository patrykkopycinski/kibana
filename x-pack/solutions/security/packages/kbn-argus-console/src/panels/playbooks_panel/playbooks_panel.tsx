/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiBasicTable,
  type EuiBasicTableColumn,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonGroup,
  EuiCallOut,
  EuiEmptyPrompt,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiSwitch,
  EuiText,
  EuiToolTip,
  EuiTitle,
} from '@elastic/eui';

import type { ArgusPlaybookUserIntent } from '@kbn/argus-console-common';

import { usePlaybookIndex } from '../../hooks';
import type { ArgusHttp } from '../../hooks';

/**
 * ARGUS playbook registry row as rendered in the console. In production the
 * panel fetches `/internal/security_solution/argus/playbooks_index` which
 * reads `.soc-workflow-registry` filtered by the `argus:playbook` tag and
 * merges the hardcoded ARGUS skill list. The local DEFAULT_PLAYBOOKS array
 * is used only as a fallback when the live route fails (cold-start cluster,
 * registry not seeded yet) and when the panel is rendered without an `http`
 * prop (Storybook / jest tests).
 */
export interface ArgusPlaybookEntry {
  readonly id: string;
  readonly kind: 'workflow' | 'skill';
  readonly name: string;
  readonly description: string;
  readonly origin?: string;
  /**
   * Id of another playbook this entry wraps. Used by the Console to
   * collapse near-duplicate entries (typically a skill wrapping a
   * canonical workflow) into a single row.
   */
  readonly canonical_of?: string;
  /** Short intent grouping key. See ArgusPlaybookUserIntent for values. */
  readonly user_intent?: ArgusPlaybookUserIntent;
  /**
   * Optional Kibana Workflows Management saved-object id. When present the
   * page wrapper deep-links to `/app/workflows/<kibana_workflow_id>`; when
   * absent it falls back to `/app/workflows/?search=<name>` so the operator
   * still lands on a useful list instead of a 404. Only populated for
   * workflow-kind entries whose registry doc has been resolved by
   * `soc-simulation/scripts/resolve_workflow_ids.sh`.
   */
  readonly kibana_workflow_id?: string;
}

export interface PlaybooksPanelProps {
  /**
   * Called when the operator activates a playbook. Workflows open in the
   * Kibana Workflows Management app; skills open in Agent Builder chat with
   * the skill pre-selected. The security_solution page wrapper implements
   * these via `application.navigateToApp` so the package stays independent
   * of Kibana's `application` client.
   */
  readonly onOpenPlaybook?: (entry: ArgusPlaybookEntry) => void;
  /**
   * Optional override for the demo-grade registry. When provided the panel
   * skips the live `/playbooks_index` fetch entirely and renders the supplied
   * entries — used by Storybook / jest tests. In production the panel reads
   * from the live registry via `http` and falls back to the hardcoded
   * DEFAULT_PLAYBOOKS list if the route fails (e.g. cold-start cluster where
   * `.soc-workflow-registry` hasn't been seeded yet).
   */
  readonly entries?: readonly ArgusPlaybookEntry[];
  /**
   * Kibana `http` client. When provided the panel fetches the live playbook
   * index; when omitted it falls straight through to DEFAULT_PLAYBOOKS so
   * the package stays renderable from Storybook without a server dep.
   */
  readonly http?: ArgusHttp;
}

const DEFAULT_PLAYBOOKS: readonly ArgusPlaybookEntry[] = [
  {
    id: 'soc_argus_playbook_runner',
    kind: 'workflow',
    name: 'ARGUS playbook runner',
    description:
      'Parameterized runner for coverage-gap-triage, datasource-gap, high-fp-tuning, and actor-escalation: ES query, threshold gate, optional mutation intents, audit row. Set workflow input playbook_id when executing.',
  },
  {
    id: 'soc_argus_exploit_to_detection',
    kind: 'workflow',
    name: 'Exploit \u2192 Detection reconciler',
    description:
      'Canonical entry point for new-CVE response. Promotes synthesized advisories through detected and reflects downstream eval verdicts back onto the advisory. Runs on a 3m schedule and can be manually triggered on demand for a specific advisory.',
    origin: 'cti_ingest',
    user_intent: 'new_cve',
  },
  {
    id: 'soc_gap_analyzer',
    kind: 'workflow',
    name: 'Gap analyzer',
    description:
      'Scan coverage across MITRE ATT&CK and emit capability_gap recommendations. Runs periodically; can also be invoked on demand.',
    origin: 'gap_analysis',
    user_intent: 'coverage_gap',
  },
  {
    id: 'soc_argus_drift_monitor',
    kind: 'workflow',
    name: 'Drift monitor',
    description:
      'Scan eval runs for rule-score drift and trust-tier trajectory. Files re-eval intents when a rule crosses its baseline.',
    user_intent: 'drift_monitor',
  },
  {
    id: 'soc_argus_redundancy_scanner',
    kind: 'workflow',
    name: 'Redundancy scanner',
    description:
      'Identify overlapping detection rules and file consolidation mutation intents that carry Pareto alternatives.',
    origin: 'consolidation',
    user_intent: 'redundancy_scan',
  },
  {
    id: 'soc_proactive_hunter',
    kind: 'workflow',
    name: 'Proactive hunter',
    description:
      'Run threat-hunting queries against recent telemetry to surface candidate TTPs before detections land.',
  },
  {
    id: 'soc_argus_frontier_simulator',
    kind: 'workflow',
    name: 'Frontier simulator',
    description:
      'Replay frontier attack scenarios end-to-end so the stack can be stress-tested against unseen TTPs.',
  },
  {
    id: 'soc_argus_arm_mythos_preset',
    kind: 'workflow',
    name: 'Arm Mythos preset',
    description:
      'One-shot setup of the Mythos demo environment: seed telemetry, enable rules, and prime coverage snapshots.',
  },
  {
    id: 'soc_demo_1_runner',
    kind: 'workflow',
    name: 'Demo \u00b7 Same-day CVE \u2192 Detection',
    description:
      'Scripted demo: ingest a fresh KEV advisory, synthesize a rule, backtest it, and approve the mutation intent.',
  },
  {
    id: 'soc_demo_2_runner',
    kind: 'workflow',
    name: 'Demo \u00b7 Polymorphic variant swarm',
    description:
      'Scripted demo: emulate a polymorphic variant swarm and walk through ARGUS redundancy + consolidation handling.',
  },
  {
    id: 'soc_deteng',
    kind: 'workflow',
    name: 'Detection engineering',
    description:
      'Guided detection engineering loop: propose a rule, evaluate it, and iterate based on backtest signal.',
  },
  {
    id: 'soc_arch_reviewer',
    kind: 'workflow',
    name: 'Architecture reviewer',
    description:
      'Review architectural decisions across the SOC stack and surface risks before they hit production.',
  },
  {
    id: 'argus-assess-readiness',
    kind: 'skill',
    name: 'Assess readiness',
    description:
      'Quick readiness read for a named threat profile. Summarises gaps and offers to file gap_analysis intents.',
    user_intent: 'readiness_assessment',
  },
  {
    id: 'argus-emulate-actor',
    kind: 'skill',
    name: 'Emulate actor',
    description:
      'Actor-focused coverage review. Correlates MITRE techniques against recent telemetry and optionally opens a case.',
    canonical_of: 'soc_argus_playbook_runner',
    user_intent: 'actor_escalation',
  },
  {
    id: 'argus-run-purple-team',
    kind: 'skill',
    name: 'Run purple team',
    description:
      'Multi-step, write-heavy purple-team exercise. Summarises coverage, backtests rules, files gap intents, and opens a case.',
    user_intent: 'purple_team',
  },
  {
    id: 'argus-assess-cve',
    kind: 'skill',
    name: 'Assess CVE',
    description:
      'Check whether a specific CVE is on ARGUS\u2019s radar, has coverage, and optionally trigger the Exploit\u2192Detection pipeline.',
    canonical_of: 'soc_argus_exploit_to_detection',
    user_intent: 'new_cve',
  },
  {
    id: 'argus-find-datasource-gaps',
    kind: 'skill',
    name: 'Find datasource gaps',
    description:
      'Surface detection gaps grouped by data source. Calls out single-source dependencies and offers to file intents.',
    user_intent: 'datasource_gap',
  },
  {
    id: 'argus-review-rule-quality',
    kind: 'skill',
    name: 'Review rule quality',
    description:
      'Read-only: recent backtest metrics, governance decisions, and trajectory for a specific rule. Never writes.',
    user_intent: 'rule_review',
  },
];

type KindFilter = 'all' | 'workflow' | 'skill';

const FILTER_OPTIONS: ReadonlyArray<{ readonly id: KindFilter; readonly label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'workflow', label: 'Workflows' },
  { id: 'skill', label: 'Skills' },
];

const kindBadge = (kind: ArgusPlaybookEntry['kind']): JSX.Element =>
  kind === 'workflow' ? (
    <EuiBadge color="primary">{'Workflow'}</EuiBadge>
  ) : (
    <EuiBadge color="accent">{'Skill'}</EuiBadge>
  );

interface GroupedPlaybook extends ArgusPlaybookEntry {
  /**
   * Additional entries that serve the same user_intent or explicitly declare
   * `canonical_of` pointing at this entry. Rendered inline as secondary
   * "Also available as…" chips. Always empty when grouping is off.
   */
  readonly variants: readonly ArgusPlaybookEntry[];
}

/**
 * Pick the canonical entry for a group of playbooks that share a user_intent.
 * Prefer:
 *   1. The entry whose id is pointed at by `canonical_of` from any sibling
 *   2. The first workflow in the group
 *   3. The first entry (fallback)
 */
const pickCanonical = (group: readonly ArgusPlaybookEntry[]): ArgusPlaybookEntry => {
  const pointed = new Set<string>();
  for (const entry of group) {
    if (entry.canonical_of) pointed.add(entry.canonical_of);
  }
  const pointedEntry = group.find((e) => pointed.has(e.id));
  if (pointedEntry) return pointedEntry;
  const firstWorkflow = group.find((e) => e.kind === 'workflow');
  return firstWorkflow ?? group[0];
};

/**
 * Collapse near-duplicate entries into a single `GroupedPlaybook`. Entries
 * without a `user_intent` pass through unchanged (empty `variants`). Entries
 * that share a `user_intent` are grouped; the canonical is promoted and the
 * rest are attached as variants.
 */
const groupByIntent = (entries: readonly ArgusPlaybookEntry[]): readonly GroupedPlaybook[] => {
  const groups = new Map<string, ArgusPlaybookEntry[]>();
  const ungrouped: ArgusPlaybookEntry[] = [];
  for (const entry of entries) {
    if (!entry.user_intent) {
      ungrouped.push(entry);
    } else {
      const bucket = groups.get(entry.user_intent);
      if (bucket) bucket.push(entry);
      else groups.set(entry.user_intent, [entry]);
    }
  }
  const grouped: GroupedPlaybook[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      grouped.push({ ...group[0], variants: [] });
    } else {
      const canonical = pickCanonical(group);
      const variants = group.filter((e) => e.id !== canonical.id);
      grouped.push({ ...canonical, variants });
    }
  }
  for (const entry of ungrouped) {
    grouped.push({ ...entry, variants: [] });
  }
  return grouped;
};

export const PlaybooksPanel: React.FC<PlaybooksPanelProps> = ({
  onOpenPlaybook,
  entries: entriesOverride,
  http,
}) => {
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [query, setQuery] = useState<string>('');
  const [groupDuplicates, setGroupDuplicates] = useState<boolean>(true);

  // Only fetch when no override is provided and we actually have an http
  // client; otherwise stay idle and fall through to DEFAULT_PLAYBOOKS.
  const liveState = usePlaybookIndex({
    http: http as ArgusHttp,
    enabled: Boolean(http) && !entriesOverride,
  });

  const source: 'override' | 'live' | 'fallback' = entriesOverride
    ? 'override'
    : liveState.status === 'success'
    ? 'live'
    : 'fallback';

  const entries: readonly ArgusPlaybookEntry[] = entriesOverride
    ? entriesOverride
    : liveState.status === 'success'
    ? liveState.data.entries
    : DEFAULT_PLAYBOOKS;

  const registryLastSeededAt =
    liveState.status === 'success' ? liveState.data.registry_last_seeded_at : null;

  const visible = useMemo<readonly GroupedPlaybook[]>(() => {
    const needle = query.trim().toLowerCase();
    // Filter before grouping so kind/search behave intuitively: switching
    // the kind filter to 'skill' must not hide skills just because they
    // group under a workflow.
    const filtered = entries.filter((entry) => {
      if (kindFilter !== 'all' && entry.kind !== kindFilter) return false;
      if (!needle) return true;
      return (
        entry.id.toLowerCase().includes(needle) ||
        entry.name.toLowerCase().includes(needle) ||
        entry.description.toLowerCase().includes(needle)
      );
    });
    if (!groupDuplicates) {
      return filtered.map((entry) => ({ ...entry, variants: [] }));
    }
    return groupByIntent(filtered);
  }, [entries, kindFilter, query, groupDuplicates]);

  const columns = useMemo<Array<EuiBasicTableColumn<GroupedPlaybook>>>(
    () => [
      {
        field: 'kind',
        name: 'Kind',
        width: '110px',
        render: (value: ArgusPlaybookEntry['kind']) => kindBadge(value),
      },
      {
        field: 'name',
        name: 'Playbook',
        width: '240px',
        render: (_value, row) => (
          <div>
            <EuiText size="s">
              <strong>{row.name}</strong>
            </EuiText>
            <EuiText size="xs" color="subdued">
              <code>{row.id}</code>
            </EuiText>
          </div>
        ),
      },
      {
        field: 'description',
        name: 'What it does',
        render: (_value: string, row) => (
          <div>
            <EuiText size="s" color="subdued">
              {row.description}
            </EuiText>
            {row.variants.length > 0 ? (
              <>
                <EuiSpacer size="xs" />
                <EuiFlexGroup
                  gutterSize="xs"
                  responsive={false}
                  wrap
                  alignItems="center"
                  data-test-subj="argusPlaybookVariants"
                >
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs" color="subdued">
                      {'Also available as:'}
                    </EuiText>
                  </EuiFlexItem>
                  {row.variants.map((variant) => (
                    <EuiFlexItem grow={false} key={variant.id}>
                      <EuiToolTip content={variant.description}>
                        <EuiBadge
                          color={variant.kind === 'workflow' ? 'primary' : 'accent'}
                          iconType="play"
                          iconSide="right"
                          iconOnClick={() => onOpenPlaybook?.(variant)}
                          iconOnClickAriaLabel={`Open ${variant.name}`}
                          onClickAriaLabel={`Open ${variant.name}`}
                          onClick={() => onOpenPlaybook?.(variant)}
                          data-test-subj={`argusPlaybookVariant-${variant.id}`}
                        >
                          {variant.name}
                        </EuiBadge>
                      </EuiToolTip>
                    </EuiFlexItem>
                  ))}
                </EuiFlexGroup>
              </>
            ) : null}
          </div>
        ),
      },
      {
        field: 'origin',
        name: 'Origin tag',
        width: '160px',
        render: (value: string | undefined) =>
          value ? (
            <EuiBadge color="hollow">
              <code>{value}</code>
            </EuiBadge>
          ) : (
            <EuiText size="xs" color="subdued">
              {'\u2014'}
            </EuiText>
          ),
      },
      {
        name: 'Run',
        width: '140px',
        actions: [
          {
            name: 'Open',
            description: 'Open this playbook in its native surface',
            icon: 'play',
            type: 'icon',
            isPrimary: true,
            onClick: (row: GroupedPlaybook) => onOpenPlaybook?.(row),
            'data-test-subj': 'argusPlaybookOpen',
          },
        ],
      },
    ],
    [onOpenPlaybook]
  );

  return (
    <EuiPanel hasBorder paddingSize="l" data-test-subj="argusConsolePlaybooksPanel">
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h3>{'Playbooks'}</h3>
          </EuiTitle>
          <EuiText size="s" color="subdued">
            {'ARGUS playbooks are Kibana-native workflows and Agent Builder skills tagged '}
            <code>{'argus:playbook'}</code>
            {'. Workflows open in Workflows Management; skills open in Agent Builder chat.'}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          {liveState.status === 'loading' ? (
            <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiLoadingSpinner size="s" />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge color="hollow">{'loading\u2026'}</EuiBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
          ) : source === 'live' ? (
            <EuiBadge color="success" data-test-subj="argusPlaybooksLiveBadge">
              {'live registry'}
            </EuiBadge>
          ) : source === 'fallback' ? (
            <EuiBadge color="warning" data-test-subj="argusPlaybooksFallbackBadge">
              {'static fallback'}
            </EuiBadge>
          ) : (
            <EuiBadge color="hollow">{'demo-grade'}</EuiBadge>
          )}
        </EuiFlexItem>
      </EuiFlexGroup>

      {source === 'fallback' && liveState.status === 'error' ? (
        <>
          <EuiSpacer size="s" />
          <EuiCallOut
            size="s"
            color="warning"
            iconType="alert"
            title={'Using the hardcoded playbook list'}
            data-test-subj="argusPlaybooksFallbackCallout"
          >
            <EuiText size="xs">
              {`Live registry lookup failed (${liveState.error.message}). `}
              {
                'The table below is the demo-grade fallback; rerun `soc-simulation/setup.sh` to seed '
              }
              <code>{'.soc-workflow-registry'}</code>
              {'.'}
            </EuiText>
          </EuiCallOut>
        </>
      ) : null}

      {source === 'live' && registryLastSeededAt ? (
        <>
          <EuiSpacer size="xs" />
          <EuiText size="xs" color="subdued">
            {'Registry last seeded: '}
            <code>{registryLastSeededAt}</code>
          </EuiText>
        </>
      ) : null}

      <EuiSpacer size="m" />

      <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiButtonGroup
            legend="Filter by kind"
            idSelected={kindFilter}
            onChange={(id) => setKindFilter(id as KindFilter)}
            options={FILTER_OPTIONS.map(({ id, label }) => ({ id, label }))}
            buttonSize="s"
            data-test-subj="argusPlaybooksKindFilter"
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFieldSearch
            placeholder="Search playbooks"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            data-test-subj="argusPlaybooksSearch"
            compressed
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiToolTip content="Collapse skills + canonical workflows that serve the same user intent into a single row.">
            <EuiSwitch
              label="Group duplicates"
              checked={groupDuplicates}
              onChange={(event) => setGroupDuplicates(event.target.checked)}
              compressed
              data-test-subj="argusPlaybooksGroupToggle"
            />
          </EuiToolTip>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      {visible.length === 0 ? (
        <EuiEmptyPrompt
          iconType="dot"
          title={<h4>{'No playbooks match'}</h4>}
          body={
            <EuiText size="s">
              {'Clear the search or switch the kind filter to see the full playbook catalogue.'}
            </EuiText>
          }
          actions={
            <EuiButtonEmpty
              onClick={() => {
                setQuery('');
                setKindFilter('all');
              }}
              data-test-subj="argusPlaybooksClearFilters"
            >
              {'Clear filters'}
            </EuiButtonEmpty>
          }
          data-test-subj="argusPlaybooksEmpty"
        />
      ) : (
        <EuiBasicTable<GroupedPlaybook>
          items={[...visible]}
          columns={columns}
          tableLayout="auto"
          data-test-subj="argusPlaybooksTable"
        />
      )}

      <EuiSpacer size="m" />

      <EuiFlexGroup justifyContent="flexEnd">
        <EuiFlexItem grow={false}>
          <EuiButton
            size="s"
            iconType="popout"
            onClick={() =>
              onOpenPlaybook?.({
                id: 'workflows',
                kind: 'workflow',
                name: 'Workflows',
                description: '',
              })
            }
            data-test-subj="argusPlaybooksOpenWorkflowsApp"
          >
            {'Open Workflows Management'}
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};
