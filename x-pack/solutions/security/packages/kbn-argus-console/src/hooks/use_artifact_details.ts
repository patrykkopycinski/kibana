/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useRef, useState } from 'react';

import {
  ARTIFACT_DETAILS_ROUTE,
  type ArgusArtifactDetails,
  type ArgusArtifactRelatedKind,
} from '@kbn/argus-console-common';

import type { ArgusHttp, FetchState } from './types';

export interface UseArtifactDetailsArgs {
  readonly http: ArgusHttp | undefined;
  readonly sourceIndex: string | undefined;
  readonly sourceDocId: string | undefined;
  /**
   * Subset of related-entity lookups to request. Defaults to all — the
   * server fan-out is cheap and omissions rarely matter in practice.
   */
  readonly includeRelated?: readonly ArgusArtifactRelatedKind[];
  readonly enabled?: boolean;
}

/**
 * Base hook for the shared artifact-details endpoint. Stays `idle` until
 * both `sourceIndex` and `sourceDocId` are present so callers can mount
 * the flyout without racing the fetch on an unselected artifact.
 */
export const useArtifactDetails = ({
  http,
  sourceIndex,
  sourceDocId,
  includeRelated,
  enabled = true,
}: UseArtifactDetailsArgs): FetchState<ArgusArtifactDetails> => {
  const hasArtifact = Boolean(sourceIndex && sourceDocId);
  const [state, setState] = useState<FetchState<ArgusArtifactDetails>>({
    status: http && enabled && hasArtifact ? 'loading' : 'idle',
  });
  const aborted = useRef(false);

  const includeKey = includeRelated ? includeRelated.join(',') : '';

  useEffect(() => {
    aborted.current = false;

    if (!http || !enabled || !sourceIndex || !sourceDocId) {
      setState({ status: 'idle' });
      return () => {
        aborted.current = true;
      };
    }

    setState({ status: 'loading' });

    const query: Record<string, string> = {
      source_index: sourceIndex,
      source_doc_id: sourceDocId,
    };
    if (includeKey) query.include_related = includeKey;

    http
      .fetch<ArgusArtifactDetails>(ARTIFACT_DETAILS_ROUTE, {
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
  }, [http, enabled, sourceIndex, sourceDocId, includeKey]);

  return state;
};

export interface UseActivityEventDetailsArgs {
  readonly http: ArgusHttp | undefined;
  readonly sourceIndex: string | undefined;
  readonly sourceDocId: string | undefined;
  readonly enabled?: boolean;
}

/**
 * Thin wrapper for the Activity feed flyout. Enumerates the related kinds
 * explicitly so TypeScript catches misspellings at the call site.
 */
export const useActivityEventDetails = ({
  http,
  sourceIndex,
  sourceDocId,
  enabled,
}: UseActivityEventDetailsArgs): FetchState<ArgusArtifactDetails> =>
  useArtifactDetails({
    http,
    sourceIndex,
    sourceDocId,
    enabled,
    includeRelated: ['rule', 'mutation_intent', 'reasoning_trace', 'outcome', 'alert', 'actor'],
  });

export interface UseMutationLineageNodeDetailsArgs {
  readonly http: ArgusHttp | undefined;
  readonly sourceIndex: string | undefined;
  readonly sourceDocId: string | undefined;
  readonly enabled?: boolean;
}

/**
 * Thin wrapper for the Mutation lineage flyout. Scoped to the entities a
 * lineage node can plausibly reference.
 */
export const useMutationLineageNodeDetails = ({
  http,
  sourceIndex,
  sourceDocId,
  enabled,
}: UseMutationLineageNodeDetailsArgs): FetchState<ArgusArtifactDetails> =>
  useArtifactDetails({
    http,
    sourceIndex,
    sourceDocId,
    enabled,
    includeRelated: ['rule', 'mutation_intent', 'reasoning_trace', 'outcome'],
  });
