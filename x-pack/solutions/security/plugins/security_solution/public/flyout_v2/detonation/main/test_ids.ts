/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { PREFIX } from '../../../flyout/shared/test_ids';

const DETONATION_DETAILS_TEST_ID = `${PREFIX}DetonationDetails` as const;

export const DETONATION_DETAILS_TITLE_TEST_ID = `${DETONATION_DETAILS_TEST_ID}Title` as const;
export const DETONATION_DETAILS_BODY_TEST_ID = `${DETONATION_DETAILS_TEST_ID}Body` as const;
export const DETONATION_DETAILS_OVERVIEW_TAB_TEST_ID =
  `${DETONATION_DETAILS_TEST_ID}OverviewTab` as const;
export const DETONATION_DETAILS_JSON_TAB_TEST_ID = `${DETONATION_DETAILS_TEST_ID}JsonTab` as const;
