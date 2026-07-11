/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter, Logger, KibanaRequest, RouteSecurity } from '@kbn/core/server';

/**
 * Security config shared by every Daybreak route. The plugin does not register
 * Kibana feature privileges yet (it is an experimental, default-off spike), so
 * routes opt out of authorization at the Kibana layer. Access is still
 * authenticated at the HTTP layer; the underlying `.kibana-daybreak-proposals`
 * and `.kibana-daybreak-evidence` indices are Kibana-owned stores (named with
 * the `.kibana-` prefix so they fall under the `.kibana*` index pattern the
 * `kibana_system` role already grants — no built-in ES role, including
 * `viewer`/`editor`, grants dot-prefixed indices, see
 * `/~(([.]|ilm-history-).*)/` in `roles.yml`), so store clients use
 * `client.asInternalUser` — matching the pattern used by other Kibana-owned
 * `StorageIndexAdapter` stores (e.g. `agent_builder`, `workflows_management`,
 * `automatic_import`).
 */
export const daybreakRouteSecurity: RouteSecurity = {
  authz: {
    enabled: false,
    reason:
      'Daybreak is an experimental plugin behind a default-off flag; the Kibana-owned proposal/evidence indices are accessed via the internal ES user, matching other StorageIndexAdapter-backed plugins.',
  },
};

/**
 * Dependencies injected into every Daybreak route registrar.
 *
 * `getSpaceId` resolves the active space for a request, falling back to the
 * default space when the Spaces plugin is absent. The PD-2 store clients are
 * space-scoped, so each handler resolves the space per-request before
 * constructing a client (FR-023).
 */
export interface RouteDependencies {
  router: IRouter;
  logger: Logger;
  getSpaceId: (request: KibanaRequest) => string;
}
