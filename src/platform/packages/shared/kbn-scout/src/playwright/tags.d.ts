/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutTargetArch, ScoutTargetDomain, ScoutTargetLocation } from '@kbn/scout-info';
/**
 * Get a list of Playwright tags that select a particular test target
 *
 * @param arch Test target architecture
 * @param domain Test target domain
 * @param location Test target location
 *
 * @return List of tags ready to use with Scout Playwright tests
 */
export declare const getPlaywrightTagsFor: (
  arch: ScoutTargetArch,
  domain: ScoutTargetDomain,
  location?: ScoutTargetLocation | 'all'
) => string[];
export declare const tags: {
  stateful: {
    classic: string[];
    /**
     * Tags to target all supported stateful deployment types
     */
    readonly all: string[];
  };
  serverless: {
    search: string[];
    observability: {
      complete: string[];
      logs_essentials: string[];
      /**
       * All observability project types
       */
      readonly all: string[];
    };
    security: {
      complete: string[];
      essentials: string[];
      ease: string[];
      /**
       * All security project types
       */
      readonly all: string[];
    };
    workplaceai: string[];
    vectordb: string[];
    /**
     * All serverless project types
     */
    readonly all: string[];
  };
  /**
   * Deployment-agnostic tag set; composed of tags for:
   * - local stateful (self-managed) & Elastic Cloud hosted (ECH) - all types
   * - local serverless (mock-serverless) & Elastic Cloud projects (MKI) - only types that have a **stateful counterpart**
   *
   * ⚠️ This does NOT include serverless project subtypes or Workplace AI projects.
   */
  readonly deploymentAgnostic: string[];
  performance: string[];
};
