/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useState } from 'react';
import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';

import { useE2dFlow, useRecentCves, type ArgusHttp, type E2dFlowWindow } from '../../hooks';
import type { ArgusArtifactPivotTarget } from '../artifact_details_flyout';
import { E2dCveList } from './e2d_cve_list';
import { E2dFlowDetailView } from './e2d_detail_view';

export interface E2dFlowPanelProps {
  readonly http?: ArgusHttp;
  /**
   * Deep-link target CVE (from the URL `?cve=...` query param). When set, the
   * panel selects this CVE on mount.
   */
  readonly initialCve?: string;
  readonly initialWindow?: E2dFlowWindow;
  /**
   * Called when the user clicks "View in Proposals" on the inline
   * alternatives block. Consumers wire this to route the user to the
   * global Proposals tab pre-focused on the same CVE.
   */
  readonly onOpenProposals?: (cveId: string) => void;
  /**
   * Optional forwarder for the stage-details flyout pivot buttons
   * (Reasoning / Lineage / Decision graph). Mirrors the Autonomy /
   * Mutation lineage / Activity feed plumbing so a single handler in
   * the console wrapper can route to every sub-panel.
   */
  readonly onPivot?: (target: ArgusArtifactPivotTarget) => void;
}

export const E2dFlowPanel: React.FC<E2dFlowPanelProps> = ({
  http,
  initialCve,
  initialWindow = '24h',
  onOpenProposals,
  onPivot,
}) => {
  const [selectedCve, setSelectedCve] = useState<string | undefined>(initialCve);
  const [window, setWindow] = useState<E2dFlowWindow>(initialWindow);
  const [kevOnly, setKevOnly] = useState<boolean>(false);
  const [filterText, setFilterText] = useState<string>('');

  const recent = useRecentCves({
    http: http as ArgusHttp,
    kevOnly,
    limit: 50,
    enabled: Boolean(http),
    refreshIntervalMs: 30_000,
  });

  const items = recent.status === 'success' ? recent.data.items : [];
  const truncated = recent.status === 'success' ? recent.data.truncated : false;

  // Auto-select the first CVE if the caller didn't pre-select one. This keeps
  // the timeline populated the moment the tab opens instead of showing an
  // empty state until the user picks.
  useEffect(() => {
    if (selectedCve || recent.status !== 'success' || items.length === 0) return;
    const first = items[0];
    setSelectedCve(first.cve_id ?? first.advisory_id);
    // Intentionally only run when the recent list finishes its initial load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recent.status]);

  const flow = useE2dFlow({
    http: http as ArgusHttp,
    cve: selectedCve,
    window,
    enabled: Boolean(http) && Boolean(selectedCve),
    refreshIntervalMs: 10_000,
  });

  return (
    <EuiFlexGroup gutterSize="l" alignItems="flexStart">
      <EuiFlexItem grow={3}>
        <E2dCveList
          items={items}
          selectedCve={selectedCve}
          onSelect={setSelectedCve}
          kevOnly={kevOnly}
          onToggleKev={setKevOnly}
          filterText={filterText}
          onChangeFilter={setFilterText}
          isLoading={recent.status === 'loading'}
          truncated={truncated}
        />
      </EuiFlexItem>
      <EuiFlexItem grow={7}>
        <E2dFlowDetailView
          http={http}
          selectedCve={selectedCve}
          window={window}
          onWindowChange={setWindow}
          flow={flow}
          onOpenProposals={onOpenProposals}
          onPivot={onPivot}
        />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
