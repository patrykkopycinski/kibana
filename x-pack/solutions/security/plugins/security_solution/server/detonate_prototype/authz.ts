/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import type { SecurityPluginStart } from '@kbn/security-plugin/server';
import { DETONATE_API_ACTION_ALL } from '@kbn/security-solution-features/actions';

import type { EndpointAppContextService } from '../endpoint/endpoint_app_context_services';

export type DetonateAccess = 'read' | 'write';

/**
 * Whether the request may use the detonation sandbox: the matching Security Solution privilege
 * (`crud` to submit, `show` to read), or the dedicated Detonate sub-feature privilege.
 */
export type HasDetonatePrivilege = (
  request: KibanaRequest,
  access: DetonateAccess
) => Promise<boolean>;

export const createDetonatePrivilegeChecker = ({
  endpointAppContextService,
  getSecurityStart,
}: {
  endpointAppContextService: EndpointAppContextService;
  getSecurityStart: () => Promise<SecurityPluginStart>;
}): HasDetonatePrivilege => {
  return async (request, access) => {
    const endpointAuthz = await endpointAppContextService.getEndpointAuthz(request);
    if (
      access === 'write'
        ? endpointAuthz.canWriteSecuritySolution
        : endpointAuthz.canReadSecuritySolution
    ) {
      return true;
    }

    // `checkPrivileges`, not UI capabilities: workflow steps and chat rounds run on fake requests,
    // where capability resolution always answers false.
    const { authz } = await getSecurityStart();
    const { hasAllRequested } = await authz.checkPrivilegesDynamicallyWithRequest(request)({
      kibana: [authz.actions.api.get(DETONATE_API_ACTION_ALL)],
    });
    return hasAllRequested;
  };
};
