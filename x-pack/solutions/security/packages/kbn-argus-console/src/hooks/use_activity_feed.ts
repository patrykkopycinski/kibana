/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import {
  ACTIVITY_FEED_ROUTE,
  type ActivityEvent,
  type ActivityFeedFilters,
  type ActivityFeedResponse,
  type ActivityLayer,
  type ActivityPressure,
} from '@kbn/argus-console-common';

import type { ArgusHttp, FetchState } from './types';

export type { ActivityEvent, ActivityFeedFilters, ActivityLayer, ActivityPressure };

const ALL_LAYERS: readonly ActivityLayer[] = [
  'telemetry',
  'detection',
  'mutation',
  'response',
  'governance',
] as const;

const EMPTY_COUNTS: Record<ActivityLayer, number> = {
  telemetry: 0,
  detection: 0,
  mutation: 0,
  response: 0,
  governance: 0,
};

export interface UseActivityFeedArgs {
  /**
   * Kibana `http` client. When omitted the hook returns the demo fixture so
   * Storybook/jest render the panel without a running ES.
   */
  readonly http?: ArgusHttp;
  /**
   * When false the hook stays `idle`. Lets the console gate on the
   * `argusConsoleEnabled` flag without conditionally rendering the hook.
   */
  readonly enabled?: boolean;
  readonly filters?: ActivityFeedFilters;
  /**
   * Hard cap on the number of events returned. Defaults to 50 server-side.
   */
  readonly limit?: number;
  /**
   * When set to a positive number the hook re-fetches every N ms. The panel
   * keeps rendering the previous event set during in-flight refreshes so
   * the demo never shows a loading spinner between ticks.
   */
  readonly refreshIntervalMs?: number;
}

export interface UseActivityFeedResult {
  readonly state: FetchState<ActivityFeedResponse>;
  readonly events: readonly ActivityEvent[];
  readonly countsByLayer: Record<ActivityLayer, number>;
  readonly truncated: boolean;
}

/**
 * Fetches the cross-layer activity feed from the internal route, with
 * graceful fallback to a small demo fixture when `http` is not wired up
 * (Storybook, unit tests, or before the flag is flipped).
 *
 * Layer filters are also applied client-side on top of the response so
 * toggling the filter chips doesn't round-trip to the server.
 */
export const useActivityFeed = ({
  http,
  enabled = true,
  filters,
  limit,
  refreshIntervalMs,
}: UseActivityFeedArgs): UseActivityFeedResult => {
  const [state, setState] = useState<FetchState<ActivityFeedResponse>>({
    status: http && enabled ? 'loading' : 'idle',
  });
  const aborted = useRef(false);

  // Keep the filter reference stable so deep-equal doesn't retrigger fetches.
  const layersKey = filters?.layers ? filters.layers.join(',') : '';
  const pressureKey = filters?.pressure ? filters.pressure.join(',') : '';
  const actorIdsKey = filters?.actorIds ? filters.actorIds.join(',') : '';
  const trustTiersKey = filters?.trustTiers ? filters.trustTiers.join(',') : '';

  useEffect(() => {
    aborted.current = false;

    if (!http || !enabled) {
      setState({ status: 'idle' });
      return () => {
        aborted.current = true;
      };
    }

    const query: Record<string, string | number> = {};
    if (filters?.layers?.length) query.layers = JSON.stringify(filters.layers);
    if (filters?.pressure?.length) query.pressure = JSON.stringify(filters.pressure);
    if (filters?.actorIds?.length) query.actorIds = JSON.stringify(filters.actorIds);
    if (filters?.trustTiers?.length) query.trustTiers = JSON.stringify(filters.trustTiers);
    if (limit !== undefined) query.limit = limit;

    // First fetch shows loading; poll refreshes silently replace data so
    // the feed "scrolls" during a demo without ever blanking out.
    let hasFirstResult = false;
    setState({ status: 'loading' });

    const runFetch = () => {
      http
        .fetch<ActivityFeedResponse>(ACTIVITY_FEED_ROUTE, {
          method: 'GET',
          version: '1',
          query,
        })
        .then((data) => {
          if (aborted.current) return;
          hasFirstResult = true;
          setState({ status: 'success', data });
        })
        .catch((err: unknown) => {
          if (aborted.current) return;
          const error = err instanceof Error ? err : new Error(String(err));
          if (!hasFirstResult) {
            setState({ status: 'error', error });
          }
        });
    };

    runFetch();

    if (!refreshIntervalMs || refreshIntervalMs <= 0) {
      return () => {
        aborted.current = true;
      };
    }

    const handle = setInterval(runFetch, refreshIntervalMs);
    return () => {
      aborted.current = true;
      clearInterval(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [http, enabled, limit, layersKey, pressureKey, actorIdsKey, trustTiersKey, refreshIntervalMs]);

  return useMemo<UseActivityFeedResult>(() => {
    if (state.status === 'success') {
      return {
        state,
        events: state.data.events,
        countsByLayer: state.data.counts_by_layer,
        truncated: state.data.truncated,
      };
    }
    if (!http) {
      // Offline fallback: return the curated demo set so the panel always
      // renders in Storybook/jest/deck screenshots.
      const demo = filterEvents(DEMO_EVENTS, filters);
      return {
        state: { status: 'idle' },
        events: demo,
        countsByLayer: countsForEvents(DEMO_EVENTS),
        truncated: false,
      };
    }
    return {
      state,
      events: [],
      countsByLayer: EMPTY_COUNTS,
      truncated: false,
    };
  }, [state, http, filters]);
};

const countsForEvents = (events: readonly ActivityEvent[]): Record<ActivityLayer, number> => {
  const counts = { ...EMPTY_COUNTS };
  for (const ev of events) counts[ev.layer] += 1;
  return counts;
};

const filterEvents = (
  events: readonly ActivityEvent[],
  filters: ActivityFeedFilters | undefined
): readonly ActivityEvent[] => {
  if (!filters) return events;
  return events.filter((ev) => {
    if (filters.layers?.length && !filters.layers.includes(ev.layer)) return false;
    if (filters.pressure?.length && (!ev.pressure || !filters.pressure.includes(ev.pressure))) {
      return false;
    }
    if (filters.actorIds?.length && !filters.actorIds.includes(ev.actor_id)) return false;
    if (
      filters.trustTiers?.length &&
      (!ev.actor_trust_tier || !filters.trustTiers.includes(ev.actor_trust_tier))
    ) {
      return false;
    }
    return true;
  });
};

// Used only when `http` is missing (Storybook / unit tests). Intentionally
// small — live renders always prefer the real route.
const DEMO_EVENTS: readonly ActivityEvent[] = ALL_LAYERS.map<ActivityEvent>((layer, idx) => ({
  id: `demo-${layer}-${idx}`,
  layer,
  timestamp: `2026-03-14T12:0${idx}:00.000Z`,
  actor_id: `demo-actor-${layer}`,
  actor_trust_tier: idx === 0 ? 'trusted' : idx === 4 ? 'probationary' : 'system',
  pressure: idx === 1 ? 'high' : idx === 3 ? 'moderate' : undefined,
  title: `Demo ${layer} event`,
  subtitle: 'Offline fixture — wire `http` for live data',
}));
