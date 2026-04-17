/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { i18n } from '@kbn/i18n';
import { SECURITY_UI_SHOW_PRIVILEGE } from '@kbn/security-solution-features/constants';
import { AUTONOMOUS_SOC_PATH, SecurityPageName } from '../../common/constants';
import type { LinkItem } from '../common/links/types';

export const AUTONOMOUS_SOC = i18n.translate('xpack.securitySolution.autonomousSoc.title', {
  defaultMessage: 'Autonomous SOC',
});

export const autonomousSocLinks: LinkItem = {
  id: SecurityPageName.autonomousSoc,
  title: AUTONOMOUS_SOC,
  path: AUTONOMOUS_SOC_PATH,
  globalNavPosition: 2,
  capabilities: [SECURITY_UI_SHOW_PRIVILEGE],
  globalSearchKeywords: [
    i18n.translate('xpack.securitySolution.appLinks.autonomousSoc', {
      defaultMessage: 'Autonomous SOC',
    }),
  ],
};
