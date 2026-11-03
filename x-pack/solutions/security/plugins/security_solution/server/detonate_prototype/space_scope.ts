/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  DetonateBaseRequest,
  DetonatePriorRunResponse,
  DetonateTask,
  DetonateTaskSearchResponse,
} from '../../common/detonate_prototype';
import {
  DETONATE_PRIOR_RUNS_LOOKBACK,
  SPACE_TAG_PREFIX,
  derivePriorRunLookup,
  runBelongsToSpace,
  spaceRunTag,
  spaceTaskQuery,
} from '../../common/detonate_prototype';
import type { DetonateClient } from './client';
import { DetonateServiceError } from './client';

/**
 * The run's tags with exactly one space tag, the caller's. A caller-supplied
 * `space:` tag is dropped so a submit cannot plant a run in another space.
 */
export const scopeTagsToSpace = (tags: string[] | undefined, spaceId: string): string[] => [
  ...(tags ?? []).filter((tag) => !tag.startsWith(SPACE_TAG_PREFIX)),
  spaceRunTag(spaceId),
];

/**
 * Submit on behalf of a space. The service never dedups, so every submit is a
 * new run, and the space tag is what makes it this space's.
 */
export const submitInSpace = <Request extends DetonateBaseRequest>(
  submit: (request: Request) => Promise<DetonateTask>,
  request: Request,
  spaceId: string
): Promise<DetonateTask> => submit({ ...request, tags: scopeTagsToSpace(request.tags, spaceId) });

/** A run from another space answers exactly like a run that does not exist. */
export const getTaskInSpace = async (
  client: DetonateClient,
  taskId: string,
  spaceId: string
): Promise<DetonateTask> => {
  const task = await client.getTask(taskId);
  if (!runBelongsToSpace(task.tags, spaceId)) {
    throw new DetonateServiceError('The detonation service answered 404.', 404);
  }
  return task;
};

/**
 * One space's page of runs. The space filter is in the query, and applied
 * again to the answer: a caller-supplied `query_string` can widen an ES
 * query, so the service's search is not the isolation boundary.
 */
export const listTasksInSpace = async (
  client: DetonateClient,
  spaceId: string,
  query: { query_string?: string; offset?: number; size?: number },
  filters: { alertId?: string } = {}
): Promise<DetonateTaskSearchResponse> => {
  const spaceQuery = spaceTaskQuery(spaceId, filters);
  const page = await client.listTasks({
    ...query,
    query_string: query.query_string ? `(${query.query_string}) AND ${spaceQuery}` : spaceQuery,
  });
  return { ...page, tasks: page.tasks.filter((task) => runBelongsToSpace(task.tags, spaceId)) };
};

/** "Have we detonated this sample before" — answered from this space's runs only. */
export const lookupPriorRunsInSpace = async (
  client: DetonateClient,
  sha256: string,
  spaceId: string
): Promise<DetonatePriorRunResponse> => {
  const normalized = sha256.toLowerCase();
  const { tasks } = await client.listTasks({
    query_string: spaceTaskQuery(spaceId, { sampleHash: normalized }),
    size: DETONATE_PRIOR_RUNS_LOOKBACK,
    order: 'desc',
  });
  return derivePriorRunLookup(normalized, tasks, spaceId);
};
