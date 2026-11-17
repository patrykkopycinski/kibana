/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DETONATION_DETAILS_TEST_ID } from '../main/test_ids';

export const DETONATION_SESSION_VIEW_TOOL_TEST_ID =
  `${DETONATION_DETAILS_TEST_ID}SessionViewTool` as const;
export const DETONATION_NOTES_TOOL_TEST_ID = `${DETONATION_DETAILS_TEST_ID}NotesTool` as const;
export const DETONATION_TOOL_SANDBOX_BADGE_TEST_ID =
  `${DETONATION_DETAILS_TEST_ID}ToolSandboxBadge` as const;
export const DETONATION_SESSION_VIEW_TOOL_ERROR_TEST_ID =
  `${DETONATION_SESSION_VIEW_TOOL_TEST_ID}Error` as const;
