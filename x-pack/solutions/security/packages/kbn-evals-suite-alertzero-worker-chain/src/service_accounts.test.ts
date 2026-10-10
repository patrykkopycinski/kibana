/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { WORKER_ROLE_DEFINITIONS } from '@kbn/alertzero-plugin/common/worker_roles';
import { SECURITY_SERVICE_ACCOUNT_URL, WORKER_IDS } from './constants';
import { resolveIdentitySpaceCell } from './identity_space_cells';
import { provisionWorkerServiceAccounts } from './service_accounts';

describe("provisionWorkerServiceAccounts with a cell's role definitions (G20)", () => {
  const makeFetch = () => {
    const roles: Array<{
      name: string;
      body: { elasticsearch: { indices: Array<{ names: string[] }> } };
    }> = [];
    const created: string[] = [];
    const fetch = jest.fn(async (path: string, options: Record<string, unknown> = {}) => {
      if (path === SECURITY_SERVICE_ACCOUNT_URL && options.method === 'GET') {
        return { serviceAccounts: [] };
      }
      if (path.includes('/api/security/role/')) {
        roles.push({
          name: decodeURIComponent(path.split('/api/security/role/')[1]),
          body: JSON.parse(String(options.body)),
        });
        return {};
      }
      if (path === SECURITY_SERVICE_ACCOUNT_URL && options.method === 'POST') {
        const { name } = JSON.parse(String(options.body));
        created.push(name);
        return { id: `ns/${name}`, name, enabled: true, assumable: true };
      }
      throw new Error(`unexpected request ${options.method ?? 'GET'} ${path}`);
    });
    return { fetch, roles, created };
  };

  const workerIds = [WORKER_IDS.alertTriage, WORKER_IDS.attackDiscovery];

  it('defaults to the product role definitions', async () => {
    const { fetch, created } = makeFetch();
    await provisionWorkerServiceAccounts(fetch as never, workerIds);
    expect(created).toEqual(workerIds.map((id) => WORKER_ROLE_DEFINITIONS[id].name));
  });

  it("creates the cell's own roles and accounts, so the negative control never touches the product role", async () => {
    const cell = resolveIdentitySpaceCell('worker-sa-space-no-entities');
    const { fetch, roles, created } = makeFetch();
    await provisionWorkerServiceAccounts(fetch as never, workerIds, cell.roleDefinitions);

    const adRole = roles.find((r) => r.name.endsWith('_g20_no_entities'));
    expect(adRole).toBeDefined();
    expect(adRole?.body.elasticsearch.indices.flatMap((i) => i.names)).not.toContain(
      'entities-latest-*'
    );
    expect(created).toContain(adRole?.name);
    expect(created).not.toContain(WORKER_ROLE_DEFINITIONS[WORKER_IDS.attackDiscovery].name);
  });
});
