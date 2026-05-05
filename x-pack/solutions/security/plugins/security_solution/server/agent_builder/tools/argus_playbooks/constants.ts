/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { securityTool } from '../constants';

/**
 * Every ARGUS playbook-primitive tool is registered under the same prefix so
 * skills can discover them uniformly and the Agent Builder UI groups them
 * together. The ids are stable — they appear verbatim in skill content, in the
 * Agent Builder audit trail, and in the `argus:playbook` workflow step
 * signatures.
 */
export const ARGUS_FILE_MUTATION_INTENT_TOOL_ID = securityTool('argus.file_mutation_intent');
export const ARGUS_SYNTHESIZE_RULE_CANDIDATE_TOOL_ID = securityTool(
  'argus.synthesize_rule_candidate'
);
export const ARGUS_RUN_BACKTEST_TOOL_ID = securityTool('argus.run_backtest');
export const ARGUS_APPROVE_REJECT_MUTATION_TOOL_ID = securityTool('argus.approve_reject_mutation');
export const ARGUS_OPEN_INVESTIGATION_TOOL_ID = securityTool('argus.open_investigation');
export const ARGUS_TOGGLE_KILL_SWITCH_TOOL_ID = securityTool('argus.toggle_kill_switch');
export const ARGUS_SUMMARIZE_COVERAGE_TOOL_ID = securityTool('argus.summarize_coverage');
export const ARGUS_LIST_UNCOVERED_TECHNIQUES_TOOL_ID = securityTool(
  'argus.list_uncovered_techniques'
);
export const ARGUS_EXPORT_NAVIGATOR_LAYER_TOOL_ID = securityTool('argus.export_navigator_layer');
export const ARGUS_GET_MUTATION_DETAIL_TOOL_ID = securityTool('argus.get_mutation_detail');
export const ARGUS_LIST_ACTOR_COVERAGE_TOOL_ID = securityTool('argus.list_actor_coverage');
export const ARGUS_GET_DECISION_GRAPH_TOOL_ID = securityTool('argus.get_decision_graph');

/**
 * Canonical playbook tag. Every ARGUS playbook workflow carries this tag so
 * the Playbooks console tab and the skill registry can discover them.
 */
export const ARGUS_PLAYBOOK_TAG = 'argus:playbook' as const;

/**
 * Canonical read tag. Read-only ARGUS tools (e.g. decision-graph, coverage
 * summaries) carry this tag so skills and the console can discover them
 * separately from mutating playbook actions.
 */
export const ARGUS_READ_TAG = 'argus:read' as const;
