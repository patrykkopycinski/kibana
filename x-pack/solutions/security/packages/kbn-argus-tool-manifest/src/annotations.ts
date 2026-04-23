/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ArgusToolAnnotations } from './types';

/**
 * Tool ID prefixes / names that indicate a skill performs a write, a
 * destructive op, or reads from the outside world. Derived from the real
 * skill JSONs under soc-simulation/skills/ as of R12 design.
 *
 * Kept as regex lists (not a single OR) so it's easy to see which class
 * each pattern belongs to and so `destructiveHint` is scoped narrower than
 * `readOnlyHint` inverted.
 */

const WRITE_TOOL_PATTERNS: readonly RegExp[] = Object.freeze([
  /^(security|platform)\.rule_create$/,
  /^(security|platform)\.rule_update$/,
  /^(security|platform)\.rule_tune$/,
  /^(security|platform)\.exception_create$/,
  /^(security|platform)\.exception_update$/,
  /^(security|platform)\.rec_apply$/,
  /^(security|platform)\.workflow\.create$/,
  /^(security|platform)\.workflow\.update$/,
]);

const DESTRUCTIVE_TOOL_PATTERNS: readonly RegExp[] = Object.freeze([
  /^(security|platform)\.rule_delete$/,
  /^(security|platform)\.rule_disable$/,
  /^(security|platform)\.exception_delete$/,
  /^(security|platform)\.workflow\.delete$/,
  /^(security|platform)\.workflow\.disable$/,
]);

const OPEN_WORLD_TOOL_PATTERNS: readonly RegExp[] = Object.freeze([
  /security_labs_search/,
  /attack_discovery_search/,
  /kev_lookup/,
  /cve_lookup/,
  /nvd_fetch/,
  /external_fetch/,
]);

const PURE_READ_CLASSIFIERS: readonly RegExp[] = Object.freeze([
  /^soc-architecture-and-gaps$/,
  /^soc-health-check$/,
  /^soc-difficulty-evaluation$/,
]);

/**
 * Compute tool annotations for a skill from its tool_ids and id. Pure.
 *
 * Rules:
 *   readOnlyHint    = tool_ids has no write and no destructive pattern
 *   destructiveHint = tool_ids has a destructive pattern
 *   idempotentHint  = skill id is a known pure-read classifier OR
 *                     tool_ids has no write pattern (same-input-same-output
 *                     holds for read paths under ARGUS's current data model)
 *   openWorldHint   = tool_ids hits any external-feed pattern
 */
export const computeToolAnnotations = (
  skillId: string,
  toolIds: readonly string[]
): ArgusToolAnnotations => {
  const hasWrite = toolIds.some((t) => WRITE_TOOL_PATTERNS.some((r) => r.test(t)));
  const hasDestructive = toolIds.some((t) => DESTRUCTIVE_TOOL_PATTERNS.some((r) => r.test(t)));
  const hasExternal = toolIds.some((t) => OPEN_WORLD_TOOL_PATTERNS.some((r) => r.test(t)));
  const isPureRead = PURE_READ_CLASSIFIERS.some((r) => r.test(skillId));

  return {
    readOnlyHint: !hasWrite && !hasDestructive,
    destructiveHint: hasDestructive,
    idempotentHint: isPureRead || !hasWrite,
    openWorldHint: hasExternal,
  };
};
