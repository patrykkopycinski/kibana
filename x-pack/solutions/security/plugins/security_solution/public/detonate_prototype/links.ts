/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

import { SECURITY_FEATURE_ID, SecurityPageName } from '../../common/constants';
import { DETONATE_PROTOTYPE_APP_PATH } from '../../common/detonate_prototype';
import type { LinkItem } from '../common/links/types';
import { DETONATE_PROTOTYPE, DETONATE_PROTOTYPE_DESCRIPTION } from './translations';

/**
 * `experimentalKey` is what keeps the prototype off by default: without
 * `detonatePrototypeEnabled`, the link is dropped by the application links
 * updater and the route reports unauthorized, so an operator who has not
 * opted in never sees it.
 */
export const detonatePrototypeLinks: LinkItem = {
  capabilities: [[`${SECURITY_FEATURE_ID}.show`]],
  description: DETONATE_PROTOTYPE_DESCRIPTION,
  experimentalKey: 'detonatePrototypeEnabled',
  globalSearchKeywords: [
    i18n.translate('xpack.securitySolution.appLinks.detonatePrototype', {
      defaultMessage: 'Detonate',
    }),
  ],
  hideTimeline: true,
  id: SecurityPageName.detonatePrototype,
  isBeta: true,
  path: DETONATE_PROTOTYPE_APP_PATH,
  title: DETONATE_PROTOTYPE,
};
