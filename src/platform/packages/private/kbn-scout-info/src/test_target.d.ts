/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { z } from '@kbn/zod/v4';
export declare const SCOUT_TARGET_LOCATION: string;
export declare const SCOUT_TARGET_ARCH: string;
export declare const SCOUT_TARGET_DOMAIN: string;
export declare const ScoutTargetLocationSchema: z.ZodEnum<{
  cloud: 'cloud';
  local: 'local';
}>;
export declare const ScoutTargetArchSchema: z.ZodEnum<{
  serverless: 'serverless';
  stateful: 'stateful';
}>;
export declare const ScoutTargetDomainSchema: z.ZodEnum<{
  classic: 'classic';
  observability_complete: 'observability_complete';
  observability_logs_essentials: 'observability_logs_essentials';
  search: 'search';
  security_complete: 'security_complete';
  security_ease: 'security_ease';
  security_essentials: 'security_essentials';
  vectordb: 'vectordb';
  workplaceai: 'workplaceai';
}>;
export declare const ScoutTestTargetSchema: z.ZodObject<
  {
    location: z.ZodEnum<{
      cloud: 'cloud';
      local: 'local';
    }>;
    arch: z.ZodEnum<{
      serverless: 'serverless';
      stateful: 'stateful';
    }>;
    domain: z.ZodEnum<{
      classic: 'classic';
      observability_complete: 'observability_complete';
      observability_logs_essentials: 'observability_logs_essentials';
      search: 'search';
      security_complete: 'security_complete';
      security_ease: 'security_ease';
      security_essentials: 'security_essentials';
      vectordb: 'vectordb';
      workplaceai: 'workplaceai';
    }>;
  },
  z.core.$strip
>;
export type ScoutTargetLocation = z.infer<typeof ScoutTargetLocationSchema>;
export type ScoutTargetArch = z.infer<typeof ScoutTargetArchSchema>;
export type ScoutTargetDomain = z.infer<typeof ScoutTargetDomainSchema>;
export interface ScoutTargetDefinition {
  locations: ScoutTargetLocation[];
  architectures: ScoutTargetArch[];
}
export declare class ScoutTestTarget {
  static tagPattern: RegExp;
  location: ScoutTargetLocation;
  arch: ScoutTargetArch;
  domain: ScoutTargetDomain;
  constructor(
    location: string | ScoutTargetLocation,
    arch: string | ScoutTargetArch,
    domain: string | ScoutTargetDomain
  );
  get tagWithoutLocation(): string;
  get tag(): string;
  get playwrightTag(): string;
  static fromTag(tag: string): ScoutTestTarget;
  static fromPlaywrightTag(playwrightTag: string): ScoutTestTarget;
  static fromEnv(): ScoutTestTarget;
  /**
   * Like fromEnv() but suppresses errors and returns undefined when Scout target env vars are missing or invalid.
   */
  static tryFromEnv(): ScoutTestTarget | undefined;
}
export declare const VALID_SCOUT_TEST_TARGET_DEFINITIONS: [
  ScoutTargetDomain,
  ScoutTargetDefinition
][];
export declare const testTargets: {
  readonly all: ScoutTestTarget[];
  forLocation(location: ScoutTargetLocation): ScoutTestTarget[];
  readonly local: ScoutTestTarget[];
  readonly cloud: ScoutTestTarget[];
};
