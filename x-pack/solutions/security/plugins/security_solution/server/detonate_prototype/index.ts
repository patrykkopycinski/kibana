/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — server entry point.
 *
 * The whole prototype attaches to Kibana through this one function, and
 * detaches by deleting the call. It is gated on an experimental feature flag
 * and on the service address being configured: a deployment that sets neither
 * is completely unaffected.
 */

import type { Logger } from '@kbn/core/server';

import type { SecuritySolutionPluginRouter } from '../types';
import type { DetonateClient } from './client';
import { createDetonateClient } from './client';
import { registerDetonatePrototypeRoutes } from './routes';

export type { DetonateClient } from './client';
export { DetonateServiceError, createDetonateClient } from './client';

/**
 * Default service address. A localhost port is useless to anyone but the
 * developer running the simulator, which is the point: no deployment address
 * appears in this repository.
 */
const DEFAULT_SERVICE_URL = 'http://127.0.0.1:8787';

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export interface DetonatePrototypeSetupDeps {
  router: SecuritySolutionPluginRouter;
  logger: Logger;
  /** `xpack.securitySolution.detonatePrototype.serviceUrl`, when set. */
  serviceUrl?: string;
  /** The experimental flag that gates the entire prototype. */
  enabled: boolean;
}

/**
 * Wire the prototype's routes, if it is switched on. Returns the client when
 * registered so the Agent Builder skill and workflow step can share it rather
 * than each constructing their own.
 */
export const setupDetonatePrototype = ({
  router,
  logger,
  serviceUrl,
  enabled,
}: DetonatePrototypeSetupDeps): DetonateClient | undefined => {
  if (!enabled) {
    return undefined;
  }

  const baseUrl = serviceUrl ?? DEFAULT_SERVICE_URL;
  const scopedLogger = logger.get('detonatePrototype');

  // Constructed once and shared. The client holds no connection, so building
  // it eagerly costs nothing and keeps the surfaces from disagreeing about
  // timeouts or the base URL.
  const client = createDetonateClient({
    baseUrl,
    requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    logger: scopedLogger,
  });

  registerDetonatePrototypeRoutes({ router, logger: scopedLogger, getClient: () => client });

  scopedLogger.info(
    `Detonate prototype enabled; proxying to the detonation service configured at ${baseUrl}`
  );

  return client;
};
