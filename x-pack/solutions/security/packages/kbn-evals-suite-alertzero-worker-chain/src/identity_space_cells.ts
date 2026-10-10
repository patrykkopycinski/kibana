/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpFetchOptions, HttpHandler } from '@kbn/core/public';
import {
  WORKER_ROLE_DEFINITIONS,
  type WorkerRoleDefinition,
} from '@kbn/alertzero-plugin/common/worker_roles';
import { WORKER_IDS } from './constants';

/**
 * G20: the identity/space matrix. Workers ship as per-worker `alertzero_<worker>`
 * service accounts in arbitrary spaces; evals used to run the Workers' data
 * access as an all-powerful identity in `default`. Each cell fixes who the
 * Workers run as and where the seeded data lives.
 *
 *  - `superuser-default`: the positive control and the baseline every other cell
 *    is compared with. The Workers' service accounts carry a superuser role.
 *  - `worker-sa-default`: the prebuilt per-worker accounts (the product install
 *    path's definitions, not a hand-rolled role), default space.
 *  - `worker-sa-space`: the same prebuilt accounts in a non-default space, with
 *    every seeded document, index and entity scoped to that space.
 *  - `worker-sa-space-no-entities`: the negative control. Identical to
 *    `worker-sa-space` except the Attack Discovery Worker's role loses its read
 *    on the entity store. Evidence completeness must drop.
 */
export const IDENTITY_SPACE_CELL_IDS = [
  'superuser-default',
  'worker-sa-default',
  'worker-sa-space',
  'worker-sa-space-no-entities',
] as const;

export type IdentitySpaceCellId = (typeof IDENTITY_SPACE_CELL_IDS)[number];

export interface IdentitySpaceCell {
  id: IdentitySpaceCellId;
  spaceId: string;
  /** Role definitions the Worker service accounts are provisioned from, by Worker id. */
  roleDefinitions: Readonly<Record<string, WorkerRoleDefinition>>;
  /** Index patterns removed from the Attack Discovery Worker's role (negative control only). */
  droppedIndexPatterns: readonly string[];
}

export const BASELINE_CELL_ID: IdentitySpaceCellId = 'superuser-default';

/** Non-default space the worker cells run in. Overridable for a stack that already has one. */
export const DEFAULT_G20_SPACE_ID = 'alertzero-g20';

/** Entity store read, the privilege the negative control drops (worker_roles.ts, Attack Discovery). */
export const ENTITY_STORE_INDEX_PATTERN = 'entities-latest-*';

const SUPERUSER_ROLE: WorkerRoleDefinition = {
  name: 'alertzero_g20_superuser',
  role: {
    description:
      'G20 eval baseline: unrestricted identity for the Workers. Created by the eval harness.',
    elasticsearch: {
      cluster: ['all'],
      indices: [{ names: ['*'], privileges: ['all'] }],
      run_as: [],
    },
    kibana: [{ spaces: ['*'], base: ['all'], feature: {} }],
  },
};

/**
 * Copy of a prebuilt role definition with some index patterns removed and a new
 * name. A privilege entry left with no names is dropped. Throws when a pattern
 * to drop is not in the role, so a change to the prebuilt role cannot turn the
 * negative control into a silent no-op.
 */
export const withoutIndexPatterns = (
  definition: WorkerRoleDefinition,
  patterns: readonly string[],
  name: string
): WorkerRoleDefinition => {
  const present = new Set(definition.role.elasticsearch.indices.flatMap((entry) => entry.names));
  const absent = patterns.filter((pattern) => !present.has(pattern));
  if (absent.length > 0) {
    throw new Error(
      `Role "${definition.name}" has no index privilege on ${absent.join(
        ', '
      )}; the negative control would drop nothing.`
    );
  }
  return {
    name,
    role: {
      ...definition.role,
      elasticsearch: {
        ...definition.role.elasticsearch,
        indices: definition.role.elasticsearch.indices
          .map((entry) => ({
            ...entry,
            names: entry.names.filter((n) => !patterns.includes(n)),
          }))
          .filter((entry) => entry.names.length > 0),
      },
    },
  };
};

export const resolveIdentitySpaceCell = (
  id: IdentitySpaceCellId,
  spaceId: string = DEFAULT_G20_SPACE_ID
): IdentitySpaceCell => {
  switch (id) {
    case 'superuser-default':
      return {
        id,
        spaceId: 'default',
        roleDefinitions: Object.fromEntries(
          Object.values(WORKER_IDS).map((workerId) => [workerId, SUPERUSER_ROLE])
        ),
        droppedIndexPatterns: [],
      };
    case 'worker-sa-default':
      return {
        id,
        spaceId: 'default',
        roleDefinitions: WORKER_ROLE_DEFINITIONS,
        droppedIndexPatterns: [],
      };
    case 'worker-sa-space':
      return { id, spaceId, roleDefinitions: WORKER_ROLE_DEFINITIONS, droppedIndexPatterns: [] };
    case 'worker-sa-space-no-entities': {
      const adWorkerId = WORKER_IDS.attackDiscovery;
      const prebuilt = WORKER_ROLE_DEFINITIONS[adWorkerId];
      if (!prebuilt) throw new Error(`No prebuilt role definition for Worker "${adWorkerId}".`);
      return {
        id,
        spaceId,
        roleDefinitions: {
          ...WORKER_ROLE_DEFINITIONS,
          [adWorkerId]: withoutIndexPatterns(
            prebuilt,
            [ENTITY_STORE_INDEX_PATTERN],
            `${prebuilt.name}_g20_no_entities`
          ),
        },
        droppedIndexPatterns: [ENTITY_STORE_INDEX_PATTERN],
      };
    }
    default:
      throw new Error(
        `Unknown identity/space cell "${String(id)}". Known: ${IDENTITY_SPACE_CELL_IDS.join(', ')}`
      );
  }
};

export const parseIdentitySpaceCellId = (raw: string | undefined): IdentitySpaceCellId =>
  raw === undefined || raw === ''
    ? BASELINE_CELL_ID
    : (IDENTITY_SPACE_CELL_IDS as readonly string[]).includes(raw)
    ? (raw as IdentitySpaceCellId)
    : (() => {
        throw new Error(
          `ALERTZERO_EVAL_IDENTITY_CELL="${raw}" is not a cell. Known: ${IDENTITY_SPACE_CELL_IDS.join(
            ', '
          )}`
        );
      })();

const XSRF = { 'kbn-xsrf': 'true' };

const statusOf = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null) return undefined;
  const { status, response } = error as { status?: unknown; response?: { status?: unknown } };
  const code = typeof status === 'number' ? status : response?.status;
  return typeof code === 'number' ? code : undefined;
};

/**
 * Creates the cell's space when it does not exist and returns what puts things
 * back: deletes the space only when this call created it (a pre-existing space
 * is never touched). `default` always exists.
 */
export const ensureSpace = async (
  fetch: HttpHandler,
  spaceId: string
): Promise<() => Promise<void>> => {
  if (spaceId === 'default') return async () => undefined;
  try {
    await fetch('/api/spaces/space', {
      method: 'POST',
      headers: XSRF,
      body: JSON.stringify({ id: spaceId, name: `AlertZero G20 (${spaceId})` }),
    } satisfies HttpFetchOptions);
  } catch (error) {
    if (statusOf(error) === 409) return async () => undefined;
    throw error;
  }
  return async () => {
    await fetch(`/api/spaces/space/${encodeURIComponent(spaceId)}`, {
      method: 'DELETE',
      headers: XSRF,
    } satisfies HttpFetchOptions);
  };
};
