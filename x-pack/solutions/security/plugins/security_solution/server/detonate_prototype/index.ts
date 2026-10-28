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
import type { SecurityPluginStart } from '@kbn/security-plugin/server';

import type { SecuritySolutionPluginRouter } from '../types';
import type { EndpointAppContextService } from '../endpoint/endpoint_app_context_services';
import type { DetonateClient } from './client';
import { createDetonateClient } from './client';
import { registerDetonatePrototypeRoutes } from './routes';
import type { HasDetonatePrivilege } from './authz';
import { createDetonatePrivilegeChecker } from './authz';

export type { DetonateClient } from './client';
export type { DetonateAccess, HasDetonatePrivilege } from './authz';
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
  /** Resolves the Security Solution privileges and the acting user. */
  endpointAppContextService: EndpointAppContextService;
  /** Resolves the Detonate sub-feature privilege. */
  getSecurityStart: () => Promise<SecurityPluginStart>;
}

export interface DetonatePrototype {
  client: DetonateClient;
  /** Shared by the routes and the Agent Builder tools, so both gate identically. */
  hasDetonatePrivilege: HasDetonatePrivilege;
}

/**
 * Wire the prototype's routes, if it is switched on. Returns the client and the
 * privilege check when registered so the Agent Builder skill shares them rather
 * than constructing its own.
 */
export const setupDetonatePrototype = ({
  router,
  logger,
  serviceUrl,
  enabled,
  endpointAppContextService,
  getSecurityStart,
}: DetonatePrototypeSetupDeps): DetonatePrototype | undefined => {
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
  const hasDetonatePrivilege = createDetonatePrivilegeChecker({
    endpointAppContextService,
    getSecurityStart,
  });

  registerDetonatePrototypeRoutes({
    router,
    logger: scopedLogger,
    getClient: () => client,
    endpointAppContextService,
    hasDetonatePrivilege,
  });

  scopedLogger.info(
    `Detonate prototype enabled; proxying to the detonation service configured at ${baseUrl}`
  );

  return { client, hasDetonatePrivilege };
};
