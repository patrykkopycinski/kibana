/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SECURITY_FEATURE_ID } from '../../../common/constants';
import { useKibana } from '../../common/lib/kibana';

/**
 * Mirrors the server's write check (`createDetonatePrivilegeChecker`): Security `crud`,
 * or the dedicated detonate sub-feature for roles that may only submit samples.
 */
export const useCanSubmitDetonation = (): boolean => {
  const capabilities = useKibana().services.application?.capabilities;
  const security = capabilities?.[SECURITY_FEATURE_ID];
  return Boolean(security?.crud || security?.detonateAll);
};
