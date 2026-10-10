/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { WORKER_ROLE_DEFINITIONS } from '@kbn/alertzero-plugin/common/worker_roles';
import { WORKER_IDS } from './constants';
import {
  DEFAULT_G20_SPACE_ID,
  ENTITY_STORE_INDEX_PATTERN,
  ensureSpace,
  IDENTITY_SPACE_CELL_IDS,
  parseIdentitySpaceCellId,
  resolveIdentitySpaceCell,
  withoutIndexPatterns,
} from './identity_space_cells';

const indexNames = (definition: {
  role: { elasticsearch: { indices: Array<{ names: string[] }> } };
}) => definition.role.elasticsearch.indices.flatMap((entry) => entry.names);

describe('identity/space cells', () => {
  it('the prebuilt Attack Discovery role reads the entity store (the negative control has something to drop)', () => {
    expect(indexNames(WORKER_ROLE_DEFINITIONS[WORKER_IDS.attackDiscovery])).toContain(
      ENTITY_STORE_INDEX_PATTERN
    );
  });

  it('superuser-default runs every Worker as an unrestricted role in the default space', () => {
    const cell = resolveIdentitySpaceCell('superuser-default');
    expect(cell.spaceId).toBe('default');
    for (const workerId of Object.values(WORKER_IDS)) {
      expect(indexNames(cell.roleDefinitions[workerId])).toEqual(['*']);
    }
  });

  it('worker-sa-default and worker-sa-space use the product role definitions unchanged', () => {
    expect(resolveIdentitySpaceCell('worker-sa-default').roleDefinitions).toBe(
      WORKER_ROLE_DEFINITIONS
    );
    const cell = resolveIdentitySpaceCell('worker-sa-space');
    expect(cell.roleDefinitions).toBe(WORKER_ROLE_DEFINITIONS);
    expect(cell.spaceId).toBe(DEFAULT_G20_SPACE_ID);
    expect(cell.spaceId).not.toBe('default');
  });

  it('worker-sa-space-no-entities differs from worker-sa-space by exactly the entity store read', () => {
    const cell = resolveIdentitySpaceCell('worker-sa-space-no-entities', 'sp1');
    const adId = WORKER_IDS.attackDiscovery;
    expect(cell.spaceId).toBe('sp1');
    expect(indexNames(cell.roleDefinitions[adId])).not.toContain(ENTITY_STORE_INDEX_PATTERN);
    expect(indexNames(cell.roleDefinitions[adId]).sort()).toEqual(
      indexNames(WORKER_ROLE_DEFINITIONS[adId])
        .filter((n) => n !== ENTITY_STORE_INDEX_PATTERN)
        .sort()
    );
    // The prebuilt definition is not mutated, and the other Worker is untouched.
    expect(indexNames(WORKER_ROLE_DEFINITIONS[adId])).toContain(ENTITY_STORE_INDEX_PATTERN);
    expect(cell.roleDefinitions[WORKER_IDS.alertTriage]).toBe(
      WORKER_ROLE_DEFINITIONS[WORKER_IDS.alertTriage]
    );
    // A separate role name, so the provisioning never overwrites the product's role.
    expect(cell.roleDefinitions[adId].name).not.toBe(WORKER_ROLE_DEFINITIONS[adId].name);
  });

  it('refuses to build a negative control that would drop nothing', () => {
    expect(() =>
      withoutIndexPatterns(WORKER_ROLE_DEFINITIONS[WORKER_IDS.attackDiscovery], ['nope-*'], 'x')
    ).toThrow(/would drop nothing/);
  });

  it('parses the env cell id, defaulting to the baseline, and rejects unknown ids', () => {
    expect(parseIdentitySpaceCellId(undefined)).toBe('superuser-default');
    expect(parseIdentitySpaceCellId('')).toBe('superuser-default');
    for (const id of IDENTITY_SPACE_CELL_IDS) expect(parseIdentitySpaceCellId(id)).toBe(id);
    expect(() => parseIdentitySpaceCellId('root')).toThrow(/not a cell/);
  });
});

describe('ensureSpace', () => {
  const statusError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

  it('creates the space and deletes it on cleanup', async () => {
    const calls: Array<[string, string | undefined]> = [];
    const fetch = jest.fn(async (path: string, options?: { method?: string }) => {
      calls.push([path, options?.method]);
      return {};
    });
    const cleanup = await ensureSpace(fetch as never, 'sp1');
    await cleanup();
    expect(calls).toEqual([
      ['/api/spaces/space', 'POST'],
      ['/api/spaces/space/sp1', 'DELETE'],
    ]);
  });

  it('never deletes a space it did not create', async () => {
    const fetch = jest.fn(async () => {
      throw statusError(409);
    });
    const cleanup = await ensureSpace(fetch as never, 'sp1');
    await cleanup();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does nothing for the default space and propagates other failures', async () => {
    const fetch = jest.fn();
    await (
      await ensureSpace(fetch as never, 'default')
    )();
    expect(fetch).not.toHaveBeenCalled();
    await expect(
      ensureSpace(
        (async () => {
          throw statusError(500);
        }) as never,
        'sp1'
      )
    ).rejects.toThrow('HTTP 500');
  });
});
