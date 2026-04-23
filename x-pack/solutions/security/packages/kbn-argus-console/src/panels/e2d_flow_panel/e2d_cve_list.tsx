/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import {
  EuiBadge,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiIcon,
  EuiPanel,
  EuiProgress,
  EuiSpacer,
  EuiSwitch,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';

import type { ArgusE2dRecentCve } from '@kbn/argus-console-common';

export const severityColor = (
  severity: string | null | undefined
): 'danger' | 'warning' | 'default' => {
  const s = (severity ?? '').toLowerCase();
  if (s === 'critical' || s === 'high') return 'danger';
  if (s === 'medium') return 'warning';
  return 'default';
};

export interface E2dCveListProps {
  readonly items: readonly ArgusE2dRecentCve[];
  readonly selectedCve: string | undefined;
  readonly onSelect: (cve: string) => void;
  readonly kevOnly: boolean;
  readonly onToggleKev: (v: boolean) => void;
  readonly filterText: string;
  readonly onChangeFilter: (v: string) => void;
  readonly isLoading: boolean;
  readonly truncated: boolean;
}

export const E2dCveList: React.FC<E2dCveListProps> = ({
  items,
  selectedCve,
  onSelect,
  kevOnly,
  onToggleKev,
  filterText,
  onChangeFilter,
  isLoading,
  truncated,
}) => {
  const visible = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => {
      return (
        (i.cve_id ?? '').toLowerCase().includes(q) ||
        (i.title ?? '').toLowerCase().includes(q) ||
        (i.draft_rule_id ?? '').toLowerCase().includes(q)
      );
    });
  }, [items, filterText]);

  return (
    <EuiPanel hasBorder paddingSize="m" data-test-subj="argusE2dCvePicker">
      <EuiTitle size="xxs">
        <h3>{'Recent CVE advisories'}</h3>
      </EuiTitle>
      <EuiSpacer size="xs" />
      <EuiText size="xs" color="subdued">
        {'Pick a CVE to trace the full path from advisory to running rule.'}
      </EuiText>

      <EuiSpacer size="s" />

      <EuiFormRow display="rowCompressed">
        <EuiFieldText
          compressed
          placeholder="Filter by CVE, title, or rule id"
          value={filterText}
          onChange={(e) => onChangeFilter(e.target.value)}
          data-test-subj="argusE2dCveFilter"
        />
      </EuiFormRow>

      <EuiSpacer size="s" />

      <EuiSwitch
        compressed
        label="KEV only"
        checked={kevOnly}
        onChange={(e) => onToggleKev(e.target.checked)}
        data-test-subj="argusE2dKevToggle"
      />

      <EuiSpacer size="s" />

      {isLoading ? <EuiProgress size="xs" color="primary" /> : null}

      <EuiSpacer size="s" />

      {visible.length === 0 ? (
        <EuiText size="s" color="subdued">
          {filterText || kevOnly
            ? 'No CVEs match the current filters.'
            : 'No CVE advisories have been ingested yet.'}
        </EuiText>
      ) : (
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          {visible.map((item) => {
            const isSelected = selectedCve === item.cve_id || selectedCve === item.advisory_id;
            return (
              <EuiPanel
                key={item.advisory_id}
                paddingSize="s"
                hasBorder
                hasShadow={false}
                color={isSelected ? 'primary' : 'plain'}
                onClick={() => onSelect(item.cve_id ?? item.advisory_id)}
                data-test-subj={`argusE2dCveRow-${item.advisory_id}`}
                style={{ marginBottom: 8, cursor: 'pointer' }}
              >
                <EuiFlexGroup
                  alignItems="center"
                  gutterSize="s"
                  responsive={false}
                  justifyContent="spaceBetween"
                >
                  <EuiFlexItem>
                    <EuiText size="s">
                      <strong>{item.cve_id ?? item.advisory_id}</strong>
                    </EuiText>
                    {item.title ? (
                      <EuiText size="xs" color="subdued">
                        {item.title}
                      </EuiText>
                    ) : null}
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                      {item.severity ? (
                        <EuiFlexItem grow={false}>
                          <EuiBadge color={severityColor(item.severity)}>{item.severity}</EuiBadge>
                        </EuiFlexItem>
                      ) : null}
                      {item.kev ? (
                        <EuiFlexItem grow={false}>
                          <EuiBadge color="danger">{'KEV'}</EuiBadge>
                        </EuiFlexItem>
                      ) : null}
                      {item.has_mutation_intent ? (
                        <EuiFlexItem grow={false}>
                          <EuiToolTip content="Has an active mutation intent">
                            <EuiIcon type="link" />
                          </EuiToolTip>
                        </EuiFlexItem>
                      ) : null}
                    </EuiFlexGroup>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiPanel>
            );
          })}
          {truncated ? (
            <EuiText size="xs" color="subdued">
              {`Showing ${visible.length} — narrow the filter to see more.`}
            </EuiText>
          ) : null}
        </div>
      )}
    </EuiPanel>
  );
};
