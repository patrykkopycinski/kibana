/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiIconType } from '@elastic/eui/src/components/icon/icon';

/**
 * Glyphs used by the detonate UI. `EuiIcon` accepts any string and renders an
 * unknown name as a broken image, so the names are checked against EUI here,
 * where a rename in an EUI upgrade fails type-check instead.
 */
export const DETONATE_ICONS = {
  back: 'chevronSingleLeft',
  copy: 'copy',
  workerPending: 'dot',
  workerSuccess: 'checkCircleFill',
  workerFailure: 'errorFill',
} as const satisfies Record<string, EuiIconType>;
