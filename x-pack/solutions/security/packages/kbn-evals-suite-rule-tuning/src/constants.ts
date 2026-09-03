/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0, the GNU Affero General Public License v3.0 only, or the Server Side
 * Public License v1 as approved by ....... Use, modification, and distribution
 * are permitted under the Elastic License 2.0.
 */

/**
 * Shared constants for the rule-tuning managed workflow eval suite.
 *
 * Inlined (rather than imported from `@kbn/workflows/managed`) to keep this
 * functional-tests package free of a runtime dependency on the security
 * solution plugin. They mirror:
 *   - PND_RULE_TUNING_WORKFLOW_ID (@kbn/workflows/managed)
 *   - WORKFLOWS_API_VERSION (workflows_management route constants)
 */

/** Managed workflow id installed globally by the security solution plugin. */
export const RULE_TUNING_WORKFLOW_ID = 'system-security-rule-tuning';

/** Public workflows_management API version (`Elastic-Api-Version` header). */
export const WORKFLOWS_API_VERSION = '2023-10-31';

/** The five tuning paths plus the manual hand-off the `ai.agent` step can emit. */
export const CHANGE_TYPES = [
  'exception',
  'query',
  'suppression',
  'risk_score',
  'disable',
  'manual',
] as const;

export type ChangeType = (typeof CHANGE_TYPES)[number];

/** Rule types whose PATCH payload accepts `alert_suppression` (see rule_schemas.schema.yaml). */
export const SUPPRESSION_CAPABLE_RULE_TYPES = ['query', 'saved_query', 'eql', 'threshold'] as const;

/** Tag prefix the workflow writes to harvested alerts. Isolated to the eval namespace. */
export const EVAL_TAG_PREFIX = 'eval-rule-tuning';
