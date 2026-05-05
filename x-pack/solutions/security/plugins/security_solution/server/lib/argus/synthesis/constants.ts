/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * AutoDEX synthesis driver — Path A constants shared by the workflow step
 * (`security.argusSynthesizeAdvisory`) and the chat tool
 * (`argus.synthesize_rule_candidate`).
 *
 * Originally this file housed TaskManager-task constants too (timeout,
 * scope, schedule). When the driver was moved onto the workflow engine
 * those settings became workflow YAML responsibilities — see
 * `soc-simulation/workflows/soc-argus-synthesis-driver.yaml`.
 */

/** Index AutoDEX advisories live in. Owned by the CTI ingestion path (B2). */
export const SYNTHESIS_ADVISORIES_INDEX = '.soc-cve-advisories';

/** Index AutoDEX writes new mutation intents to. */
export const SYNTHESIS_MUTATION_INTENTS_INDEX = '.soc-mutation-intents';

/** Audit log index. */
export const SYNTHESIS_EVOLUTION_LOG_INDEX = '.soc-evolution-log';

/** Reasoning-trace index, populated from `VariantTraceEvent`s. */
export const SYNTHESIS_REASONING_TRACE_INDEX = '.soc-reasoning-trace';

/** Cluster-wide kill-switch index. Inspected by the workflow's first step. */
export const SYNTHESIS_KILL_SWITCH_INDEX = '.soc-kill-switch';

/**
 * Reject-rate above which `synthesizeOne` parks an advisory in the
 * dead-letter outcome instead of writing a mutation intent. The validator
 * is intentionally strict (axis markers, golden-set blocklist, platform-
 * binary allow-list); a rate above this threshold means the LLM is
 * consistently failing to follow the prompt for that advisory and a
 * human should review it.
 */
export const SYNTHESIS_REJECTION_RATE_DEAD_LETTER_THRESHOLD = 0.6;

/**
 * Provider name written to `.soc-mutation-intents` envelopes when the
 * autonomous workflow step produced the doc. Matches the convention in
 * `soc-deteng.yaml` / `argus.exploit_to_detection`.
 */
export const SYNTHESIS_DRIVER_AGENT_ID = 'argus.synthesis.driver';

export const SYNTHESIS_DRIVER_AGENT_VERSION = '1.0.0';

/**
 * Initial trust tier the driver writes onto its mutation intents. Mirrors
 * the RFC §7 Stage 3 plan — first-day mutations route to human review until
 * the trust-tier assessor graduates the agent.
 */
export const SYNTHESIS_DRIVER_INITIAL_TRUST_TIER = 'probationary' as const;
