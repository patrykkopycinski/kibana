/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiEmptyPrompt,
  EuiFieldSearch,
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiIcon,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiStat,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';

import {
  NAVIGATOR_LAYER_ROUTE,
  type ArgusCoverageCell,
  type ArgusCoverageSnapshot,
  type ArgusThreatActor,
  type ArgusThreatProfile,
} from '@kbn/argus-console-common';

import {
  useCoverageSnapshot,
  useRedundancySummary,
  useThreatActorCoverage,
  useThreatActors,
  useThreatProfiles,
  type ArgusHttp,
  type ArgusRedundancySummary,
} from '../../hooks';
import { MutationDetailFlyout } from '../mutations_panel/mutation_detail_flyout';

export interface CoveragePanelProps {
  readonly http?: ArgusHttp;
}

type CoverageStatus = 'argus_only' | 'shared' | 'community_only' | 'uncovered';

const classifyCell = (cell: ArgusCoverageCell): CoverageStatus => {
  const argus = cell.argus_authored > 0;
  const community = cell.community_authored > 0;
  if (argus && community) return 'shared';
  if (argus && !community) return 'argus_only';
  if (!argus && community) return 'community_only';
  return 'uncovered';
};

const STATUS_STYLE: Record<
  CoverageStatus,
  {
    readonly bg: string;
    readonly border: string;
    readonly iconType: string;
    readonly iconColor: string;
    readonly label: string;
  }
> = {
  argus_only: {
    bg: '#d3f9d8',
    border: '#2f9e44',
    iconType: 'checkInCircleFilled',
    iconColor: '#2f9e44',
    label: 'ARGUS covers (community gap)',
  },
  shared: {
    bg: '#d0ebff',
    border: '#1971c2',
    iconType: 'checkInCircleFilled',
    iconColor: '#1971c2',
    label: 'ARGUS + community cover',
  },
  community_only: {
    bg: '#ffe3e3',
    border: '#e03131',
    iconType: 'alert',
    iconColor: '#c92a2a',
    label: 'Community-only (ARGUS gap)',
  },
  uncovered: {
    bg: '#f8f9fa',
    border: '#ced4da',
    iconType: 'dot',
    iconColor: '#adb5bd',
    label: 'No coverage yet',
  },
};

const deltaLabel = (delta: number): string => {
  if (delta === 0) return '=';
  return delta > 0 ? `+${delta}` : `${delta}`;
};

interface CellsByTactic {
  readonly tactic_id: string;
  readonly tactic_name: string;
  readonly cells: readonly ArgusCoverageCell[];
}

const groupByTactic = (
  cells: readonly ArgusCoverageCell[],
  searchLower: string
): readonly CellsByTactic[] => {
  const filtered = searchLower
    ? cells.filter(
        (c) =>
          c.technique_id.toLowerCase().includes(searchLower) ||
          c.technique_name.toLowerCase().includes(searchLower)
      )
    : cells;
  const map = new Map<string, { tactic_name: string; cells: ArgusCoverageCell[] }>();
  for (const cell of filtered) {
    let entry = map.get(cell.tactic_id);
    if (!entry) {
      entry = { tactic_name: cell.tactic_name, cells: [] };
      map.set(cell.tactic_id, entry);
    }
    entry.cells.push(cell);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tactic_id, { tactic_name, cells: tacticCells }]) => ({
      tactic_id,
      tactic_name,
      cells: tacticCells,
    }));
};

export const CoveragePanel: React.FC<CoveragePanelProps> = ({ http }) => {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [actorQuery, setActorQuery] = useState('');
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [openIntentId, setOpenIntentId] = useState<string | null>(null);

  const httpOrStub = http as ArgusHttp | undefined;
  const enabled = Boolean(httpOrStub);

  const redundancy = useRedundancySummary({
    http: httpOrStub as ArgusHttp,
    enabled,
  });

  const profiles = useThreatProfiles({
    http: httpOrStub as ArgusHttp,
    enabled,
  });
  const snapshot = useCoverageSnapshot({
    http: httpOrStub as ArgusHttp,
    profileId,
    enabled,
  });
  const actors = useThreatActors({
    http: httpOrStub as ArgusHttp,
    query: actorQuery,
    enabled,
  });
  const actorCoverage = useThreatActorCoverage({
    http: httpOrStub as ArgusHttp,
    actorId: selectedActorId,
    enabled,
  });

  const profileOptions = useMemo(() => {
    const base = [{ value: '', text: 'All techniques (no profile)' }];
    if (profiles.status !== 'success') return base;
    return [
      ...base,
      ...profiles.data.profiles.map((p: ArgusThreatProfile) => ({
        value: p.profile_id,
        text: p.name,
      })),
    ];
  }, [profiles]);

  const snapshotData: ArgusCoverageSnapshot | null =
    snapshot.status === 'success' ? snapshot.data : null;

  const grouped = useMemo<readonly CellsByTactic[]>(
    () => (snapshotData ? groupByTactic(snapshotData.cells, search.trim().toLowerCase()) : []),
    [snapshotData, search]
  );

  const onDownloadNavigatorLayer = async () => {
    if (!httpOrStub) return;
    const query: Record<string, string> = {};
    if (profileId) query.profile_id = profileId;
    try {
      const layer = await httpOrStub.fetch<object>(NAVIGATOR_LAYER_ROUTE, {
        method: 'GET',
        version: '1',
        query,
      });
      const blob = new Blob([JSON.stringify(layer, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `argus-navigator-layer-${profileId ?? 'all'}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDownloadError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDownloadError(msg);
    }
  };

  if (!httpOrStub) {
    return (
      <EuiPanel hasBorder paddingSize="l" data-test-subj="argusCoveragePanelDisabled">
        <EuiEmptyPrompt
          iconType="eyeClosed"
          title={<h4>{'Coverage surface disabled'}</h4>}
          body={
            <EuiText size="s">
              {'Enable '}
              <code>{'argusCoverageEnabled'}</code>
              {' in your experimental features and seed the corpus with '}
              <code>{'scripts/argus_seed_coverage.js'}</code>
              {' to light up this panel.'}
            </EuiText>
          }
        />
      </EuiPanel>
    );
  }

  return (
    <EuiPanel hasBorder paddingSize="l" data-test-subj="argusCoveragePanel">
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
        <EuiFlexItem>
          <EuiTitle size="xs">
            <h3>{'Community-corpus coverage'}</h3>
          </EuiTitle>
          <EuiText size="s" color="subdued">
            {
              'Tactic × technique heatmap — ARGUS-authored detections vs the aggregated community corpus ('
            }
            <code>{'.soc-detection-corpus'}</code>
            {
              '). Positive cells mean ARGUS over-covers; negative cells are techniques the community hits that ARGUS is missing.'
            }
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton
            size="s"
            iconType="download"
            onClick={onDownloadNavigatorLayer}
            data-test-subj="argusCoverageDownloadLayer"
          >
            {'Download Navigator layer'}
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>

      {downloadError ? (
        <>
          <EuiSpacer size="s" />
          <EuiCallOut
            color="warning"
            iconType="alert"
            title="Couldn't download Navigator layer"
            size="s"
            data-test-subj="argusCoverageDownloadError"
          >
            {downloadError}
          </EuiCallOut>
        </>
      ) : null}

      <EuiSpacer size="m" />

      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
        <EuiFlexItem grow={false} style={{ minWidth: 280 }}>
          <EuiSelect
            prepend="Threat profile"
            options={profileOptions}
            value={profileId ?? ''}
            onChange={(e) => setProfileId(e.target.value || null)}
            compressed
            data-test-subj="argusCoverageProfileSelect"
          />
        </EuiFlexItem>
        <EuiFlexItem style={{ minWidth: 280 }}>
          <EuiFieldSearch
            placeholder="Filter techniques"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            compressed
            fullWidth
            data-test-subj="argusCoverageSearch"
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      {snapshotData ? (
        <EuiFlexGroup gutterSize="m" responsive={false} wrap>
          <EuiFlexItem grow={false}>
            <EuiStat
              title={snapshotData.total_techniques}
              description="Techniques in scope"
              titleSize="s"
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiStat
              title={snapshotData.argus_authored_count}
              description="ARGUS-authored"
              titleSize="s"
              titleColor="primary"
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiStat
              title={snapshotData.only_community_count}
              description="Community-only"
              titleSize="s"
              titleColor="danger"
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiStat
              title={snapshotData.shared_count}
              description="Shared"
              titleSize="s"
              titleColor="subdued"
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiStat
              title={snapshotData.only_argus_count}
              description="ARGUS-only"
              titleSize="s"
              titleColor="success"
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      ) : null}

      <EuiSpacer size="s" />

      <RedundancyRow summary={redundancy} onOpenIntent={setOpenIntentId} />

      <EuiSpacer size="m" />

      {snapshot.status === 'loading' ? (
        <EuiFlexGroup justifyContent="center" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="m" />
          </EuiFlexItem>
        </EuiFlexGroup>
      ) : snapshot.status === 'error' ? (
        <EuiCallOut
          color="danger"
          iconType="alert"
          title="Couldn't load coverage snapshot"
          data-test-subj="argusCoverageError"
        >
          {snapshot.error.message}
        </EuiCallOut>
      ) : grouped.length === 0 ? (
        <EuiEmptyPrompt
          iconType="dot"
          title={<h4>{'No matching techniques'}</h4>}
          body={
            <EuiText size="s">
              {'Either the corpus is empty or the current filter hides everything. Try '}
              <code>{'scripts/argus_seed_coverage.js'}</code>
              {' or clear the search.'}
            </EuiText>
          }
        />
      ) : (
        <div data-test-subj="argusCoverageHeatmap">
          <CoverageLegend />
          <EuiSpacer size="s" />
          {grouped.map((group) => (
            <TacticGroup key={group.tactic_id} group={group} />
          ))}
        </div>
      )}

      <EuiHorizontalRule margin="l" />

      <EuiTitle size="xxs">
        <h4>{'Threat actor drill-down'}</h4>
      </EuiTitle>
      <EuiSpacer size="xs" />
      <EuiText size="s" color="subdued">
        {'Pick an actor to see per-technique coverage scored against the current snapshot.'}
      </EuiText>
      <EuiSpacer size="s" />
      <EuiFieldSearch
        placeholder="Search by actor name / id / alias"
        value={actorQuery}
        onChange={(e) => setActorQuery(e.target.value)}
        compressed
        fullWidth
        data-test-subj="argusCoverageActorSearch"
      />
      <EuiSpacer size="s" />

      {actors.status === 'success' ? (
        <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
          {actors.data.actors.length === 0 ? (
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {'No matching actors.'}
              </EuiText>
            </EuiFlexItem>
          ) : (
            actors.data.actors.map((a: ArgusThreatActor) => (
              <EuiFlexItem grow={false} key={a.actor_id}>
                <EuiButtonEmpty
                  size="xs"
                  onClick={() => setSelectedActorId(a.actor_id)}
                  color={selectedActorId === a.actor_id ? 'primary' : 'text'}
                  data-test-subj={`argusCoverageActor-${a.actor_id}`}
                >
                  {a.actor_name} <EuiBadge color="hollow">{a.actor_id}</EuiBadge>
                </EuiButtonEmpty>
              </EuiFlexItem>
            ))
          )}
        </EuiFlexGroup>
      ) : null}

      {selectedActorId && actorCoverage.status === 'success' ? (
        <>
          <EuiSpacer size="m" />
          <EuiFlexGroup gutterSize="m" responsive={false} wrap>
            <EuiFlexItem grow={false}>
              <EuiStat
                title={actorCoverage.data.total_techniques}
                description="Actor techniques"
                titleSize="s"
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiStat
                title={actorCoverage.data.covered_by_argus}
                description="Covered by ARGUS"
                titleSize="s"
                titleColor="success"
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiStat
                title={actorCoverage.data.covered_by_community_only}
                description="Community-only"
                titleSize="s"
                titleColor="danger"
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiStat
                title={actorCoverage.data.uncovered}
                description="Uncovered"
                titleSize="s"
                titleColor="warning"
              />
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="s" />
          <EuiFlexGrid columns={4} gutterSize="s">
            {actorCoverage.data.per_technique.map((cell) => (
              <EuiFlexItem key={cell.technique_id}>
                <TechniqueCell cell={cell} compact />
              </EuiFlexItem>
            ))}
          </EuiFlexGrid>
        </>
      ) : null}

      {openIntentId && httpOrStub ? (
        <MutationDetailFlyout
          http={httpOrStub}
          mutationIntentId={openIntentId}
          onClose={() => setOpenIntentId(null)}
        />
      ) : null}
    </EuiPanel>
  );
};

/**
 * Tier 2 — Redundancy row. Shows counts of active `consolidation`-origin
 * mutation intents filed by the redundancy scanner workflow, plus a
 * handful of recent chips that deep-link into the Mutation Detail flyout.
 */
const RedundancyRow: React.FC<{
  readonly summary: ReturnType<typeof useRedundancySummary>;
  readonly onOpenIntent: (id: string) => void;
}> = ({ summary, onOpenIntent }) => {
  if (summary.status === 'loading') {
    return (
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiLoadingSpinner size="s" />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            {'Loading redundancy summary…'}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }
  if (summary.status === 'error') {
    return (
      <EuiCallOut
        size="s"
        color="warning"
        iconType="alert"
        title="Couldn't load redundancy summary"
      >
        {summary.error.message}
      </EuiCallOut>
    );
  }
  if (summary.status !== 'success') return null;
  const data: ArgusRedundancySummary = summary.data;
  if (data.total_active_consolidation_intents === 0) {
    return (
      <EuiText size="xs" color="subdued" data-test-subj="argusCoverageRedundancyEmpty">
        {'No active consolidation intents — the corpus is already deduplicated.'}
      </EuiText>
    );
  }
  return (
    <EuiFlexGroup
      direction="column"
      gutterSize="xs"
      responsive={false}
      data-test-subj="argusCoverageRedundancyRow"
    >
      <EuiFlexItem grow={false}>
        <EuiFlexGroup gutterSize="m" responsive={false} wrap alignItems="baseline">
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">
              <strong>{'Redundancy: '}</strong>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiStat
              title={data.total_active_consolidation_intents.toLocaleString()}
              description="Active consolidation intents"
              titleSize="xs"
              titleColor="warning"
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiStat
              title={data.rules_now_redundant.toLocaleString()}
              description="Dominated ARGUS rules"
              titleSize="xs"
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiStat
              title={data.techniques_affected.toLocaleString()}
              description="Techniques affected"
              titleSize="xs"
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
      {data.recent_intents.length > 0 ? (
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
            {data.recent_intents.map((intent) => (
              <EuiFlexItem key={intent.mutation_intent_id} grow={false}>
                <EuiBadge
                  color="warning"
                  onClick={() => onOpenIntent(intent.mutation_intent_id)}
                  onClickAriaLabel={`Open mutation ${intent.mutation_intent_id}`}
                  data-test-subj="argusCoverageRedundancyIntentChip"
                >
                  {intent.technique_id
                    ? `${intent.technique_id} · ${intent.rule_id ?? intent.mutation_intent_id}`
                    : intent.mutation_intent_id}
                </EuiBadge>
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
        </EuiFlexItem>
      ) : null}
    </EuiFlexGroup>
  );
};

const TacticGroup: React.FC<{ readonly group: CellsByTactic }> = ({ group }) => (
  <>
    <EuiSpacer size="xs" />
    <EuiText size="s">
      <strong>{group.tactic_name}</strong>{' '}
      <EuiText size="xs" color="subdued" css={{ display: 'inline' }}>
        <code>{group.tactic_id}</code>
      </EuiText>
    </EuiText>
    <EuiSpacer size="xs" />
    <EuiFlexGrid columns={4} gutterSize="s">
      {group.cells.map((cell) => (
        <EuiFlexItem key={cell.technique_id}>
          <TechniqueCell cell={cell} />
        </EuiFlexItem>
      ))}
    </EuiFlexGrid>
    <EuiSpacer size="s" />
  </>
);

const CoverageLegend: React.FC = () => {
  const items: ReadonlyArray<{ readonly key: CoverageStatus; readonly label: string }> = [
    { key: 'argus_only', label: 'ARGUS covers' },
    { key: 'shared', label: 'ARGUS + community' },
    { key: 'community_only', label: 'Community-only gap' },
    { key: 'uncovered', label: 'No coverage' },
  ];
  return (
    <EuiFlexGroup
      gutterSize="m"
      responsive={false}
      wrap
      alignItems="center"
      data-test-subj="argusCoverageLegend"
    >
      {items.map(({ key, label }) => {
        const style = STATUS_STYLE[key];
        return (
          <EuiFlexItem grow={false} key={key}>
            <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
              <EuiFlexItem grow={false}>
                <span
                  aria-hidden
                  style={{
                    display: 'inline-block',
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    backgroundColor: style.bg,
                    border: `1px solid ${style.border}`,
                  }}
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiIcon type={style.iconType} size="s" color={style.iconColor} />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="subdued">
                  {label}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        );
      })}
    </EuiFlexGroup>
  );
};

const TechniqueCell: React.FC<{
  readonly cell: ArgusCoverageCell;
  readonly compact?: boolean;
}> = ({ cell, compact }) => {
  const status = classifyCell(cell);
  const style = STATUS_STYLE[status];
  const tooltip = `${cell.technique_name} (${cell.technique_id}) · ${style.label} · ARGUS ${
    cell.argus_authored
  } vs community ${cell.community_authored} · sources: ${
    cell.contributing_sources.length ? cell.contributing_sources.join(', ') : 'none'
  }`;
  const showDelta = cell.delta !== 0;
  return (
    <EuiToolTip position="top" content={tooltip}>
      <div
        data-test-subj={`argusCoverageCell-${cell.technique_id}`}
        data-coverage-status={status}
        style={{
          backgroundColor: style.bg,
          border: `1px solid ${style.border}`,
          borderLeft: `3px solid ${style.border}`,
          borderRadius: 4,
          padding: compact ? '4px 6px' : '6px 8px',
          minHeight: compact ? 44 : 56,
          cursor: 'default',
        }}
      >
        <EuiFlexGroup
          justifyContent="spaceBetween"
          alignItems="center"
          gutterSize="xs"
          responsive={false}
        >
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiIcon
                  type={style.iconType}
                  size="s"
                  color={style.iconColor}
                  aria-label={style.label}
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size="xs">
                  <strong>{cell.technique_id}</strong>
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
          {showDelta ? (
            <EuiFlexItem grow={false}>
              <EuiBadge color={cell.delta > 0 ? 'success' : 'hollow'}>
                {deltaLabel(cell.delta)}
              </EuiBadge>
            </EuiFlexItem>
          ) : null}
        </EuiFlexGroup>
        {!compact ? (
          <EuiText
            size="xs"
            color="subdued"
            css={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {cell.technique_name}
          </EuiText>
        ) : null}
      </div>
    </EuiToolTip>
  );
};
