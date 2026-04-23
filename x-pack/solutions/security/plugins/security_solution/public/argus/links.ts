/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

import { SECURITY_UI_SHOW_PRIVILEGE } from '@kbn/security-solution-features/constants';

import { ARGUS_PATH, SecurityPageName } from '../../common/constants';
import type { LinkItem } from '../common/links/types';

export const ARGUS = i18n.translate('xpack.securitySolution.argus.title', {
  defaultMessage: 'Argus',
});

export const argusLinks: LinkItem = {
  id: SecurityPageName.argus,
  title: ARGUS,
  path: ARGUS_PATH,
  globalNavPosition: 3,
  capabilities: [SECURITY_UI_SHOW_PRIVILEGE],
  globalSearchKeywords: [
    i18n.translate('xpack.securitySolution.appLinks.argus', {
      defaultMessage: 'Argus console',
    }),
    i18n.translate('xpack.securitySolution.appLinks.argusReasoning', {
      defaultMessage: 'Argus reasoning drill-down',
    }),
    i18n.translate('xpack.securitySolution.appLinks.argusMutationLineage', {
      defaultMessage: 'Argus mutation lineage',
    }),
  ],
};
