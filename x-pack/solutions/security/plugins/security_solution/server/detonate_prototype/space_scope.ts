/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DetonateBaseRequest, DetonateTask } from '../../common/detonate_prototype';
import { SPACE_TAG_PREFIX, runBelongsToSpace, spaceRunTag } from '../../common/detonate_prototype';
import type { DetonateClient, DetonateSubmitOutcome } from './client';
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
 * Submit on behalf of a space. The service dedups by hash across every
 * space, so a reused report from another space is not returned: the sample is
 * resubmitted as a fresh run owned by this space.
 */
export const submitInSpace = async <Request extends DetonateBaseRequest>(
  submit: (request: Request) => Promise<DetonateSubmitOutcome>,
  request: Request,
  spaceId: string
): Promise<DetonateSubmitOutcome> => {
  const scoped: Request = { ...request, tags: scopeTagsToSpace(request.tags, spaceId) };
  const outcome = await submit(scoped);
  if (!outcome.deduplicated || runBelongsToSpace(outcome.task.tags, spaceId)) {
    return outcome;
  }
  return submit({ ...scoped, force_fresh: true });
};

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
