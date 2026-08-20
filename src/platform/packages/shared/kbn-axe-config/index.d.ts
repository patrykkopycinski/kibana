/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ReporterVersion } from 'axe-core';
export declare const AXE_CONFIG: {
  rules: {
    id: string;
    selector: string;
  }[];
};
export declare const AXE_OPTIONS: {
  reporter: ReporterVersion;
  runOnly: string[];
  rules: {
    'color-contrast': {
      enabled: boolean;
    };
    bypass: {
      enabled: boolean;
    };
    'nested-interactive': {
      enabled: boolean;
    };
  };
};
export declare const AXE_IMPACT_LEVELS: Array<'minor' | 'moderate' | 'serious' | 'critical'>;
