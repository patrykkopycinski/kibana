/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core-http-server-mocks';
import { registerProposalsFromWorkerRoute } from './proposals_from_worker';
import { getHandlerWrapper } from './wrap_handler';
import type { RouteDependencies } from './types';

const createMockRouter = () => {
  const routes: Array<{ path: string; method: string }> = [];
  return {
    routes,
    get: jest.fn((config: { path: string }) => { routes.push({ path: config.path, method: 'GET' }); return jest.fn(); }),
    post: jest.fn((config: { path: string }) => { routes.push({ path: config.path, method: 'POST' }); return jest.fn(); }),
    put: jest.fn(),
    delete: jest.fn(),
  };
};

const createMockDependencies = (): RouteDependencies => {
  const router = createMockRouter() as unknown as RouteDependencies['router'];
  return {
    router,
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), get: jest.fn().mockReturnThis() } as unknown as RouteDependencies['logger'],
    getSpaceId: jest.fn().mockReturnValue('default'),
  };
};

describe('proposals_from_worker route', () => {
  it('registers POST /api/daybreak/proposals/from-worker-run', () => {
    const deps = createMockDependencies();
    registerProposalsFromWorkerRoute(deps);
    expect(deps.router.post).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/daybreak/proposals/from-worker-run' }),
      expect.any(Function)
    );
  });
});
