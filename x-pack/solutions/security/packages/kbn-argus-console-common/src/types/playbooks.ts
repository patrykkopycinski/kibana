/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Tag written on every workflow registry entry and Agent Builder skill that
 * the ARGUS Playbooks console tab should surface. The tag is authored in
 * `soc-simulation/workflows/_registry.json` for workflows and hardcoded in
 * the skill registry for skills (skill definitions don't have a `tags` field
 * today, so the server-side route knows which skill ids belong here).
 */
export const ARGUS_PLAYBOOK_TAG = 'argus:playbook' as const;

export type ArgusPlaybookKind = 'workflow' | 'skill';

/**
 * Short machine-friendly tag that identifies the user-visible *intent* a
 * playbook serves, independent of whether the entry is a workflow or a
 * skill. Multiple entries can share the same `user_intent` — the ARGUS
 * Console Playbooks tab groups them so operators don't see near-duplicates
 * (e.g. `argus_assess_cve` skill + `soc_argus_exploit_to_detection`
 * workflow both serve `user_intent: 'new_cve'`).
 */
export type ArgusPlaybookUserIntent =
  | 'new_cve'
  | 'coverage_gap'
  | 'high_fp_tuning'
  | 'actor_escalation'
  | 'datasource_gap'
  | 'rule_review'
  | 'redundancy_scan'
  | 'drift_monitor'
  | 'readiness_assessment'
  | 'purple_team';

/**
 * Canonical shape of a playbook as surfaced by the live discovery route.
 * Identical to the UI-side `ArgusPlaybookEntry`; we re-export the UI type
 * from the `kbn-argus-console` package as a structural alias.
 */
export interface ArgusPlaybook {
  readonly id: string;
  readonly kind: ArgusPlaybookKind;
  readonly name: string;
  readonly description: string;
  /**
   * Optional `argus.origin`-style tag rendered as a badge in the table. For
   * workflows we don't have this today; for skills we hardcode the mapping
   * server-side based on the skill's intent (cti_ingest / gap_analysis / ...).
   */
  readonly origin?: string;
  /**
   * Optional id of another playbook that this one wraps. When set, the
   * Console collapses this entry under the canonical target so operators
   * see a single row with the wrapper surfaced as a secondary action
   * (typically: skill → canonical workflow).
   *
   * MUST be an id that also appears in the same index response — renderers
   * that cannot resolve a `canonical_of` MUST fall back to rendering the
   * entry as a standalone row so wrappers never become invisible.
   */
  readonly canonical_of?: string;
  /**
   * Optional user-intent grouping key. The Playbooks tab uses this to
   * group entries with identical intent into a single row (with the
   * canonical entry promoted and the rest shown as "Also available as").
   */
  readonly user_intent?: ArgusPlaybookUserIntent;
  /**
   * Optional Kibana Workflows Management saved-object id (e.g.
   * `workflow-1169617b-d198-441c-a65a-56941e1f26ba`). When present the
   * ARGUS Playbooks tab deep-links to `/app/workflows/<id>`. When absent
   * the row falls back to `/app/workflows/?search=<name>` so the operator
   * still lands on a useful list. Skills never carry this field.
   *
   * The server-side `/playbooks_index` route populates this from the
   * registry doc's `kibana_workflow_id` field, which is resolved by
   * setup.sh after the bulk workflow import completes (workflows receive
   * auto-generated UUID ids that don't match the slug-style registry
   * keys).
   */
  readonly kibana_workflow_id?: string;
}

export interface ArgusPlaybookIndexResponse {
  readonly entries: readonly ArgusPlaybook[];
  /** ISO-8601 timestamp of when the registry was last seeded. */
  readonly registry_last_seeded_at: string | null;
}
