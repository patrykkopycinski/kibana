/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiDescriptionList,
  EuiFilterButton,
  EuiFilterGroup,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiLink,
  EuiCallOut,
} from '@elastic/eui';

import type { ArgusArtifactDetails } from '@kbn/argus-console-common';

import type { ActivityEvent, ActivityLayer, ArgusHttp } from '../../hooks';
import { useActivityFeed } from '../../hooks';
import {
  ArgusArtifactDetailsFlyout,
  DocumentNarrativeSummary,
  type ArgusArtifactPivotTarget,
} from '../artifact_details_flyout';

const ALL_LAYERS: readonly ActivityLayer[] = [
  'telemetry',
  'detection',
  'mutation',
  'response',
  'governance',
] as const;

const LAYER_COLORS: Record<ActivityLayer, string> = {
  telemetry: 'default',
  detection: 'primary',
  mutation: 'accent',
  response: 'success',
  governance: 'warning',
};

const PRESSURE_COLORS: Record<NonNullable<ActivityEvent['pressure']>, string> = {
  low: 'default',
  moderate: 'warning',
  high: 'warning',
  critical: 'danger',
};

export interface ActivityFeedPanelProps {
  readonly http?: ArgusHttp;
  readonly enabled?: boolean;
  readonly onSelectReasoning?: (event: ActivityEvent) => void;
  readonly onSelectLineage?: (event: ActivityEvent) => void;
  /**
   * Optional pivot forwarder for the shared details flyout. Wired up by the
   * console so "Open reasoning" / "Open lineage" / "Open decision graph"
   * buttons in the flyout land in the same panels the inline row links drive.
   */
  readonly onPivot?: (target: ArgusArtifactPivotTarget) => void;
}

export const ActivityFeedPanel: React.FC<ActivityFeedPanelProps> = ({
  http,
  enabled,
  onSelectReasoning,
  onSelectLineage,
  onPivot,
}) => {
  const [enabledLayers, setEnabledLayers] = useState<ReadonlySet<ActivityLayer>>(
    new Set(ALL_LAYERS)
  );
  const [selectedEvent, setSelectedEvent] = useState<ActivityEvent | undefined>(undefined);

  // Only pass `layers` to the hook when the user has actually trimmed the set.
  // Sending all 5 is equivalent to "no filter" on the server and we'd rather
  // have the server return the full stream for the counts badges.
  const layersArg =
    enabledLayers.size === ALL_LAYERS.length ? undefined : Array.from(enabledLayers);

  const { state, events, countsByLayer, truncated } = useActivityFeed({
    http,
    enabled,
    filters: layersArg ? { layers: layersArg } : undefined,
    // Silent 8s refresh so new ticker events drop into the top of the feed
    // without the user pressing reload. Slightly faster than the Pulse
    // cadence (10s) because the feed is the panel users stare at during a
    // demo and we want visible motion.
    refreshIntervalMs: 8_000,
  });

  const toggleLayer = (layer: ActivityLayer): void => {
    setEnabledLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next.size === 0 ? new Set(ALL_LAYERS) : next;
    });
  };

  const handleRowClick = useCallback((event: ActivityEvent) => {
    setSelectedEvent(event);
  }, []);

  return (
    <EuiPanel hasBorder paddingSize="l" data-test-subj="argusConsoleActivityFeedPanel">
      <EuiTitle size="xs">
        <h3>{'Activity feed'}</h3>
      </EuiTitle>
      <EuiText size="s" color="subdued">
        {'Cross-layer stream of Argus events. Click a row to view full details.'}
      </EuiText>
      <EuiSpacer size="s" />
      <EuiFilterGroup>
        {ALL_LAYERS.map((layer) => (
          <EuiFilterButton
            key={layer}
            hasActiveFilters={enabledLayers.has(layer)}
            numFilters={countsByLayer[layer]}
            onClick={() => toggleLayer(layer)}
            data-test-subj={`argusConsoleActivityFeedLayer-${layer}`}
          >
            {layer}
          </EuiFilterButton>
        ))}
      </EuiFilterGroup>

      <EuiSpacer size="m" />

      {state.status === 'loading' && events.length === 0 ? (
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="s" />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText color="subdued" size="s">
              {'Loading activity feed…'}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      ) : null}

      {state.status === 'error' ? (
        <>
          <EuiCallOut
            size="s"
            color="warning"
            iconType="alert"
            title="Activity feed is degraded"
            data-test-subj="argusConsoleActivityFeedError"
          >
            <EuiText size="s">{state.error.message}</EuiText>
          </EuiCallOut>
          <EuiSpacer size="s" />
        </>
      ) : null}

      {truncated ? (
        <>
          <EuiCallOut
            size="s"
            color="primary"
            iconType="iInCircle"
            title="Showing the most recent events"
          >
            <EuiText size="s">
              {
                'More events are available server-side. Tighten the filters or widen the limit to see them.'
              }
            </EuiText>
          </EuiCallOut>
          <EuiSpacer size="s" />
        </>
      ) : null}

      {events.length === 0 && state.status !== 'loading' ? (
        <EuiText color="subdued">{'No events match the current filters.'}</EuiText>
      ) : (
        events.map((event) => (
          <ActivityRow
            key={event.id}
            event={event}
            onSelectReasoning={onSelectReasoning}
            onSelectLineage={onSelectLineage}
            onRowClick={handleRowClick}
          />
        ))
      )}

      {selectedEvent && http ? (
        <ActivityEventDetailsFlyout
          http={http}
          event={selectedEvent}
          onClose={() => setSelectedEvent(undefined)}
          onPivot={onPivot}
        />
      ) : null}
    </EuiPanel>
  );
};

/**
 * Click-target lookup for the shared details flyout. Prefers the explicit
 * `(source_index, source_doc_id)` pair the server put on the event; falls
 * back to parsing the `${index}:${doc_id}` / `${index}:${doc_id}:${layer}`
 * composite id that `activity_feed_builder` uses for cross-index events so
 * synthetic rows are still openable instead of feeling broken.
 */
const deriveArtifactKey = (
  event: ActivityEvent
): { readonly index: string; readonly docId: string } => {
  if (event.source_index && event.source_doc_id) {
    return { index: event.source_index, docId: event.source_doc_id };
  }
  const parts = event.id.split(':');
  if (parts.length >= 2 && parts[0].startsWith('.')) {
    const docIdParts = parts.length === 2 ? parts.slice(1) : parts.slice(1, parts.length - 1);
    return { index: parts[0], docId: docIdParts.join(':') };
  }
  // Last-resort: send the full id against a sentinel index; the server
  // will respond with `reason_code: not_found` and the Summary tab still
  // renders the event metadata we pass via `renderSummary`.
  return { index: event.source_index ?? '.soc-unknown', docId: event.source_doc_id ?? event.id };
};

const ActivityEventDetailsFlyout: React.FC<{
  readonly http: ArgusHttp;
  readonly event: ActivityEvent;
  readonly onClose: () => void;
  readonly onPivot?: (target: ArgusArtifactPivotTarget) => void;
}> = ({ http, event, onClose, onPivot }) => {
  const key = useMemo(() => deriveArtifactKey(event), [event]);

  const renderSummary = useCallback(
    (details: ArgusArtifactDetails | undefined) => (
      <ActivityEventSummary event={event} details={details} />
    ),
    [event]
  );

  return (
    <ArgusArtifactDetailsFlyout
      http={http}
      title={event.title}
      subtitle={event.subtitle}
      sourceIndex={key.index}
      sourceDocId={key.docId}
      onClose={onClose}
      onPivot={onPivot}
      renderSummary={renderSummary}
      dataTestSubj="argusConsoleActivityFeedDetailsFlyout"
    />
  );
};

interface DescriptionItem {
  readonly title: NonNullable<React.ReactNode>;
  readonly description: NonNullable<React.ReactNode>;
}

const ActivityEventSummary: React.FC<{
  readonly event: ActivityEvent;
  readonly details: ArgusArtifactDetails | undefined;
}> = ({ event, details }) => {
  const items: DescriptionItem[] = [
    {
      title: 'When',
      description: `${new Date(event.timestamp).toISOString().replace('T', ' ').slice(0, 19)}Z`,
    },
    {
      title: 'Layer',
      description: <EuiBadge color={LAYER_COLORS[event.layer]}>{event.layer}</EuiBadge>,
    },
    { title: 'Actor', description: event.actor_id },
  ];
  if (event.actor_trust_tier)
    items.push({ title: 'Trust tier', description: event.actor_trust_tier });
  if (event.pressure) {
    items.push({
      title: 'Pressure',
      description: <EuiBadge color={PRESSURE_COLORS[event.pressure]}>{event.pressure}</EuiBadge>,
    });
  }
  return (
    <>
      <EuiDescriptionList compressed listItems={items} />
      <EuiSpacer size="m" />
      <DocumentNarrativeSummary
        details={details}
        dataTestSubj="argusConsoleActivityFeedNarrative"
      />
    </>
  );
};

const ActivityRow: React.FC<{
  readonly event: ActivityEvent;
  readonly onSelectReasoning?: (event: ActivityEvent) => void;
  readonly onSelectLineage?: (event: ActivityEvent) => void;
  readonly onRowClick: (event: ActivityEvent) => void;
}> = ({ event, onSelectReasoning, onSelectLineage, onRowClick }) => {
  const handleKeyDown = (evt: React.KeyboardEvent<HTMLDivElement>): void => {
    if (evt.key === 'Enter' || evt.key === ' ') {
      evt.preventDefault();
      onRowClick(event);
    }
  };

  // Swallow click propagation for the inline deep-link buttons so clicking
  // "Reasoning" doesn't *also* open the full details flyout.
  const stop = (evt: React.MouseEvent) => evt.stopPropagation();

  return (
    <EuiPanel
      hasShadow={false}
      hasBorder
      paddingSize="s"
      data-test-subj={`argusConsoleActivityFeedRow-${event.id}`}
      style={{ marginBottom: 8, cursor: 'pointer' }}
      role="button"
      tabIndex={0}
      aria-label={`Open details for ${event.title}`}
      onClick={() => onRowClick(event)}
      onKeyDown={handleKeyDown}
    >
      <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
        <EuiFlexItem grow={false} style={{ width: 180 }}>
          <EuiText size="xs" color="subdued">
            {`${new Date(event.timestamp).toISOString().replace('T', ' ').slice(0, 19)}Z`}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge color={LAYER_COLORS[event.layer]}>{event.layer}</EuiBadge>
        </EuiFlexItem>
        {event.pressure ? (
          <EuiFlexItem grow={false}>
            <EuiBadge color={PRESSURE_COLORS[event.pressure]}>{event.pressure}</EuiBadge>
          </EuiFlexItem>
        ) : null}
        <EuiFlexItem>
          <EuiText size="s">
            <strong>{event.title}</strong>
            {event.subtitle ? (
              <>
                {' '}
                <span style={{ color: '#6a6a6a' }}>{`— ${event.subtitle}`}</span>
              </>
            ) : null}
          </EuiText>
          <EuiText size="xs" color="subdued">
            <EuiIcon type="user" size="s" /> {event.actor_id}
            {event.actor_trust_tier ? ` · ${event.actor_trust_tier}` : ''}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false} onClick={stop}>
          <EuiFlexGroup gutterSize="s" responsive={false}>
            {event.run_id || event.alert_id ? (
              <EuiFlexItem grow={false}>
                <EuiLink
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    onSelectReasoning?.(event);
                  }}
                  data-test-subj={`argusConsoleActivityFeedRowReasoning-${event.id}`}
                >
                  {'Reasoning'}
                </EuiLink>
              </EuiFlexItem>
            ) : null}
            {event.rule_id || event.alert_id ? (
              <EuiFlexItem grow={false}>
                <EuiLink
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    onSelectLineage?.(event);
                  }}
                  data-test-subj={`argusConsoleActivityFeedRowLineage-${event.id}`}
                >
                  {'Lineage'}
                </EuiLink>
              </EuiFlexItem>
            ) : null}
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};
