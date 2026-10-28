/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core/server/mocks';

import { createDetonatePrivilegeChecker } from './authz';

describe('createDetonatePrivilegeChecker', () => {
  const request = httpServerMock.createKibanaRequest();

  const setup = ({
    canRead = false,
    canWrite = false,
    hasDetonate = false,
  }: {
    canRead?: boolean;
    canWrite?: boolean;
    hasDetonate?: boolean;
  }) => {
    const checkPrivileges = jest.fn().mockResolvedValue({ hasAllRequested: hasDetonate });
    const security = {
      authz: {
        checkPrivilegesDynamicallyWithRequest: jest.fn().mockReturnValue(checkPrivileges),
        actions: { api: { get: (action: string) => `api:${action}` } },
      },
    };
    const hasDetonatePrivilege = createDetonatePrivilegeChecker({
      endpointAppContextService: {
        getEndpointAuthz: jest.fn().mockResolvedValue({
          canReadSecuritySolution: canRead,
          canWriteSecuritySolution: canWrite,
        }),
      } as never,
      getSecurityStart: async () => security as never,
    });
    return { hasDetonatePrivilege, checkPrivileges };
  };

  it('grants write to a Security Solution writer without checking the Detonate privilege', async () => {
    const { hasDetonatePrivilege, checkPrivileges } = setup({ canRead: true, canWrite: true });

    await expect(hasDetonatePrivilege(request, 'write')).resolves.toBe(true);
    expect(checkPrivileges).not.toHaveBeenCalled();
  });

  it('denies write to a read-only analyst without the Detonate privilege', async () => {
    const { hasDetonatePrivilege, checkPrivileges } = setup({ canRead: true });

    await expect(hasDetonatePrivilege(request, 'write')).resolves.toBe(false);
    expect(checkPrivileges).toHaveBeenCalledWith({
      kibana: ['api:securitySolution-detonateAll'],
    });
  });

  it('grants read to a Security Solution reader', async () => {
    const { hasDetonatePrivilege } = setup({ canRead: true });

    await expect(hasDetonatePrivilege(request, 'read')).resolves.toBe(true);
  });

  it.each(['read', 'write'] as const)(
    'grants %s to an identity holding only the Detonate privilege',
    async (access) => {
      const { hasDetonatePrivilege } = setup({ hasDetonate: true });

      await expect(hasDetonatePrivilege(request, access)).resolves.toBe(true);
    }
  );

  it.each(['read', 'write'] as const)('denies %s to an identity with neither', async (access) => {
    const { hasDetonatePrivilege } = setup({});

    await expect(hasDetonatePrivilege(request, access)).resolves.toBe(false);
  });
});
