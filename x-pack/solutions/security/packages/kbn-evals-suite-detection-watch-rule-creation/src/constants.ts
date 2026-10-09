/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under the
 * Elastic License 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Managed workflow id, installed globally by the alertzero plugin at start via installStatic /
 * ALERTZERO_WATCH_WORKFLOW_IDS. The eval asserts this exact document is present — it does not create or
 * carry its own copy, so eval and production cannot drift.
 */
export { ALERTZERO_RULE_CREATION_WORKFLOW_ID as RULE_CREATION_WORKFLOW_ID } from '@kbn/workflows/managed';

/**
 * Public workflows_management API version (`Elastic-Api-Version` header). Inlined: the source of
 * truth (API_VERSION in workflows_management route constants) lives in the plugin, not a package.
 */
export const WORKFLOWS_API_VERSION = '2023-10-31';

/** Step ids from the managed workflow yaml (@kbn/workflows managed/definitions/alertzero/rule_creation.yaml). */
export const DRAFT_STEP_ID = 'draft_creation';
/**
 * The step that raises the draft as a proposal on the investigation and parks on the analyst's
 * decision. It replaced the inline `review_creation` approval gate: the decision is now taken
 * through the proposals API, not the inbox respond route.
 */
export const PROPOSE_STEP_ID = 'propose_creation';

/** Workflow input naming the investigation the proposal is recorded on. Required by the workflow. */
export const INVESTIGATION_INPUT = 'investigation_id';

/**
 * Inference feature the workflow's `ai.agent` step resolves its connector from
 * (`connector-id-by-feature`). Inlined to match ALERTZERO_REASONING_INFERENCE_FEATURE_ID in
 * @kbn/alertzero-common, which a test package cannot depend on.
 */
export const RULE_CREATION_INFERENCE_FEATURE_ID = 'alertzero_reasoning';
export const INFERENCE_SETTINGS_ROUTE = '/internal/search_inference_endpoints/settings';
export const INFERENCE_SETTINGS_API_VERSION = '1';

/** Agent Builder public API version, for creating the investigation conversation. */
export const AGENT_BUILDER_API_VERSION = '2023-10-31';

/**
 * Agent Builder tool the workflow's `ai.agent` step is instructed to call. Consumed by the
 * Tool Routing evaluator (src/evaluators/tool_routing.ts) via tool-span counting on the
 * execution's trace.
 */
export const RULE_CREATION_TOOL_ID = 'security.create_detection_rule';

/** Agent Builder tool the detection-rule-edit skill directs the agent to call after drafting. */
export const RULE_PREVIEW_TOOL_ID = 'security.run_rule_preview';

/**
 * Production reaches rule_creation through the coverage Worker: the per-space Worker workflow
 * (bound to the Worker's service account) -> coverage_worker sweep -> coverage_review ->
 * `run_rule_creation` (`run-as-mode: inherit`). Every hop after the Worker is a GLOBAL managed
 * workflow, which the binding guard refuses to bind (workflow_service_account_binding.ts:
 * "Service account bindings require a workflow installed in a specific space"), so the eval
 * binds only the Worker and lets the identity flow down by inheritance, as production does.
 */
export {
  ALERTZERO_COVERAGE_REVIEW_WORKFLOW_ID as COVERAGE_REVIEW_WORKFLOW_ID,
  ALERTZERO_WORKER_DETECTION_RULE_COVERAGE_WORKFLOW_ID as COVERAGE_WORKER_ID,
} from '@kbn/workflows/managed';

/** Space the Worker is enabled in and the indicators are seeded for: a specific space, never `*`. */
export const EVAL_SPACE_ID = 'default';

/** AlertZero internal Workers API (`ALERTZERO_WORKERS_URL`, `API_VERSIONS.internal.v1`), inlined. */
export const ALERTZERO_WORKERS_URL = '/internal/alertzero/workers';
export const ALERTZERO_API_VERSION = '1';

/**
 * Autonomy the Worker runs at. `assisted` skips coverage_review's manual entry gate, so the
 * first proposal is the rule-creation one this suite scores.
 */
export const COVERAGE_WORKER_AUTONOMY = 'assisted';

/**
 * Name of the prebuilt service account production creates for the coverage Worker
 * (`alertzero_rule_coverage`, worker_roles.ts). The fixture looks it up; it never mints one.
 */
export const COVERAGE_WORKER_SERVICE_ACCOUNT_NAME = 'alertzero_rule_coverage';

/** Env override for the Worker's service account id (same name as the #293963 worker-chain suite). */
export const SERVICE_ACCOUNT_ENV = 'ALERTZERO_EVAL_SERVICE_ACCOUNT_ID';

/** Internal security API version used by the service-account routes. */
export const SERVICE_ACCOUNTS_API_VERSION = '1';

/**
 * Backing index of the AI index the coverage sweep reads (coverage_worker.yaml reads
 * `ai-index-idx-{{ ai_index_id }}`, default `security-investigations`).
 */
export const COVERAGE_AI_INDEX_ID = 'security-investigations';
export const COVERAGE_BACKING_INDEX = `ai-index-idx-${COVERAGE_AI_INDEX_ID}`;

/** The coverage_review step that hands the gap to rule_creation. */
export const RUN_RULE_CREATION_STEP_ID = 'run_rule_creation';

/** The coverage_review step that opens the investigation every proposal is recorded on. */
export const CREATE_INVESTIGATION_STEP_ID = 'create_investigation';

/** Skill the workflow's `ai.agent` step is instructed to route through. */
export const RULE_CREATION_SKILL_ID = 'detection-rule-edit';
