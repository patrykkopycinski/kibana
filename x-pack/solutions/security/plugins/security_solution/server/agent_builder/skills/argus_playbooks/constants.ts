/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Canonical skill ids. These strings appear in audit trails, skill registry
 * listings, and the ARGUS Playbooks console tab — changing them is a
 * breaking change.
 */
export const ARGUS_ASSESS_READINESS_SKILL_ID = 'argus-assess-readiness' as const;
export const ARGUS_EMULATE_ACTOR_SKILL_ID = 'argus-emulate-actor' as const;
export const ARGUS_RUN_PURPLE_TEAM_SKILL_ID = 'argus-run-purple-team' as const;
export const ARGUS_ASSESS_CVE_SKILL_ID = 'argus-assess-cve' as const;
export const ARGUS_FIND_DATASOURCE_GAPS_SKILL_ID = 'argus-find-datasource-gaps' as const;
export const ARGUS_REVIEW_RULE_QUALITY_SKILL_ID = 'argus-review-rule-quality' as const;

/**
 * Every ARGUS playbook skill carries this tag so the Playbooks console tab and
 * the skill registry can discover them uniformly.
 */
export const ARGUS_PLAYBOOK_SKILL_TAG = 'argus:playbook' as const;
