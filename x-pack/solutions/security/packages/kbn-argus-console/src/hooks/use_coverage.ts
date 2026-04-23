/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useRef, useState } from 'react';

import {
  COVERAGE_ROUTE,
  REDUNDANCY_SUMMARY_ROUTE,
  THREAT_PROFILES_ROUTE,
  THREAT_ACTORS_ROUTE,
  type ArgusActorCoverage,
  type ArgusCoverageSnapshot,
  type ArgusThreatActor,
  type ArgusThreatProfile,
} from '@kbn/argus-console-common';

import type { ArgusHttp, FetchState } from './types';

export interface UseCoverageSnapshotArgs {
  readonly http: ArgusHttp;
  readonly profileId: string | null;
  readonly enabled?: boolean;
}

export const useCoverageSnapshot = ({
  http,
  profileId,
  enabled = true,
}: UseCoverageSnapshotArgs): FetchState<ArgusCoverageSnapshot> => {
  const [state, setState] = useState<FetchState<ArgusCoverageSnapshot>>({
    status: enabled ? 'loading' : 'idle',
  });
  const aborted = useRef(false);

  useEffect(() => {
    aborted.current = false;
    if (!enabled) {
      setState({ status: 'idle' });
      return () => {
        aborted.current = true;
      };
    }
    setState({ status: 'loading' });
    const query: Record<string, string> = {};
    if (profileId) query.profile_id = profileId;

    http
      .fetch<ArgusCoverageSnapshot>(COVERAGE_ROUTE, {
        method: 'GET',
        version: '1',
        query,
      })
      .then((data) => {
        if (aborted.current) return;
        setState({ status: 'success', data });
      })
      .catch((err: unknown) => {
        if (aborted.current) return;
        const error = err instanceof Error ? err : new Error(String(err));
        setState({ status: 'error', error });
      });

    return () => {
      aborted.current = true;
    };
  }, [http, enabled, profileId]);

  return state;
};

interface ThreatProfilesResponse {
  readonly profiles: readonly ArgusThreatProfile[];
}

export const useThreatProfiles = ({
  http,
  enabled = true,
}: {
  readonly http: ArgusHttp;
  readonly enabled?: boolean;
}): FetchState<ThreatProfilesResponse> => {
  const [state, setState] = useState<FetchState<ThreatProfilesResponse>>({
    status: enabled ? 'loading' : 'idle',
  });
  const aborted = useRef(false);

  useEffect(() => {
    aborted.current = false;
    if (!enabled) {
      setState({ status: 'idle' });
      return () => {
        aborted.current = true;
      };
    }
    setState({ status: 'loading' });
    http
      .fetch<ThreatProfilesResponse>(THREAT_PROFILES_ROUTE, {
        method: 'GET',
        version: '1',
      })
      .then((data) => {
        if (aborted.current) return;
        setState({ status: 'success', data });
      })
      .catch((err: unknown) => {
        if (aborted.current) return;
        const error = err instanceof Error ? err : new Error(String(err));
        setState({ status: 'error', error });
      });
    return () => {
      aborted.current = true;
    };
  }, [http, enabled]);

  return state;
};

interface ThreatActorsResponse {
  readonly actors: readonly ArgusThreatActor[];
}

export const useThreatActors = ({
  http,
  query,
  enabled = true,
}: {
  readonly http: ArgusHttp;
  readonly query?: string;
  readonly enabled?: boolean;
}): FetchState<ThreatActorsResponse> => {
  const [state, setState] = useState<FetchState<ThreatActorsResponse>>({
    status: enabled ? 'loading' : 'idle',
  });
  const aborted = useRef(false);

  useEffect(() => {
    aborted.current = false;
    if (!enabled) {
      setState({ status: 'idle' });
      return () => {
        aborted.current = true;
      };
    }
    setState({ status: 'loading' });
    const queryObj: Record<string, string> = {};
    if (query && query.trim()) queryObj.q = query.trim();
    http
      .fetch<ThreatActorsResponse>(THREAT_ACTORS_ROUTE, {
        method: 'GET',
        version: '1',
        query: queryObj,
      })
      .then((data) => {
        if (aborted.current) return;
        setState({ status: 'success', data });
      })
      .catch((err: unknown) => {
        if (aborted.current) return;
        const error = err instanceof Error ? err : new Error(String(err));
        setState({ status: 'error', error });
      });
    return () => {
      aborted.current = true;
    };
  }, [http, enabled, query]);

  return state;
};

export const useThreatActorCoverage = ({
  http,
  actorId,
  enabled = true,
}: {
  readonly http: ArgusHttp;
  readonly actorId: string | null;
  readonly enabled?: boolean;
}): FetchState<ArgusActorCoverage> => {
  const [state, setState] = useState<FetchState<ArgusActorCoverage>>({
    status: enabled && actorId ? 'loading' : 'idle',
  });
  const aborted = useRef(false);

  useEffect(() => {
    aborted.current = false;
    if (!enabled || !actorId) {
      setState({ status: 'idle' });
      return () => {
        aborted.current = true;
      };
    }
    setState({ status: 'loading' });
    // The actor coverage route is a compound path — build it explicitly
    // rather than adding a new constant with a token so we share the same
    // shape as the rest of the hooks file.
    const path = `/internal/security_solution/argus/threat_actors/${encodeURIComponent(
      actorId
    )}/coverage`;
    http
      .fetch<ArgusActorCoverage>(path, { method: 'GET', version: '1' })
      .then((data) => {
        if (aborted.current) return;
        setState({ status: 'success', data });
      })
      .catch((err: unknown) => {
        if (aborted.current) return;
        const error = err instanceof Error ? err : new Error(String(err));
        setState({ status: 'error', error });
      });
    return () => {
      aborted.current = true;
    };
  }, [http, enabled, actorId]);

  return state;
};

export interface ArgusRedundancySummary {
  readonly total_active_consolidation_intents: number;
  readonly rules_now_redundant: number;
  readonly techniques_affected: number;
  readonly recent_intents: ReadonlyArray<{
    readonly mutation_intent_id: string;
    readonly rule_id: string | null;
    readonly technique_id: string | null;
    readonly filed_at: string | null;
  }>;
}

export const useRedundancySummary = ({
  http,
  enabled = true,
}: {
  readonly http: ArgusHttp;
  readonly enabled?: boolean;
}): FetchState<ArgusRedundancySummary> => {
  const [state, setState] = useState<FetchState<ArgusRedundancySummary>>({
    status: enabled ? 'loading' : 'idle',
  });
  const aborted = useRef(false);

  useEffect(() => {
    aborted.current = false;
    if (!enabled) {
      setState({ status: 'idle' });
      return () => {
        aborted.current = true;
      };
    }
    setState({ status: 'loading' });
    http
      .fetch<ArgusRedundancySummary>(REDUNDANCY_SUMMARY_ROUTE, {
        method: 'GET',
        version: '1',
      })
      .then((data) => {
        if (aborted.current) return;
        setState({ status: 'success', data });
      })
      .catch((err: unknown) => {
        if (aborted.current) return;
        const error = err instanceof Error ? err : new Error(String(err));
        setState({ status: 'error', error });
      });
    return () => {
      aborted.current = true;
    };
  }, [http, enabled]);

  return state;
};
