/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { sampleRules } from './sample_rules';

const CREATE_RULE_TOOL_ID = 'security.create_detection_rule';
const FIND_RULES_TOOL_ID = 'security.find_rules';
const DISCOVER_RULE_TAGS_TOOL_ID = 'security.discover_rule_tags';

/** Minimum-sufficient find-rules path per find-security-rules SKILL.md (discover every turn). */
const FIND_RULES_TRAJECTORY = [DISCOVER_RULE_TAGS_TOOL_ID, FIND_RULES_TOOL_ID] as const;

export interface RuleRoutingExample {
  id: string;
  input: { question: string };
  expected: {
    reference: string;
    expectedSkill?: string;
    shouldNotActivateSkill?: string;
    tool_sequence?: string[];
  };
  metadata: {
    category: 'rule-creation' | 'find-rules' | 'distractor';
    routing_intent: string;
    dataset_split: string[];
    is_distractor?: boolean;
    expectedToolId?: string;
    expectedOnlyToolId?: string;
    forbiddenToolId?: string;
    tool_sequence?: string[];
  };
}

/**
 * Natural-language routing examples for the default Elastic agent (`elastic-ai-agent`).
 * Track B: skill collision + tool routing — no forced tool prompt, no rule attachment.
 */
const ruleCreationExamples: RuleRoutingExample[] = sampleRules.slice(0, 3).map((rule) => ({
  id: `routing-create-${rule.id}`,
  input: { question: rule.prompt },
  expected: {
    reference:
      'The agent should route to detection rule creation via security.create_detection_rule, not load the find-security-rules skill.',
    shouldNotActivateSkill: 'find-security-rules',
  },
  metadata: {
    category: 'rule-creation',
    routing_intent: 'Rule Creation',
    dataset_split: ['base'],
    expectedToolId: CREATE_RULE_TOOL_ID,
  },
}));

const findRulesExamples: RuleRoutingExample[] = [
  {
    id: 'routing-find-mitre-tag',
    input: { question: 'List all enabled detection rules tagged with MITRE.' },
    expected: {
      reference:
        'The agent should load find-security-rules and call security.find_rules — not create a new detection rule.',
      expectedSkill: 'find-security-rules',
      tool_sequence: [...FIND_RULES_TRAJECTORY],
    },
    metadata: {
      category: 'find-rules',
      routing_intent: 'Rule Discovery',
      dataset_split: ['base'],
      expectedOnlyToolId: FIND_RULES_TOOL_ID,
      forbiddenToolId: CREATE_RULE_TOOL_ID,
      tool_sequence: [...FIND_RULES_TRAJECTORY],
    },
  },
  {
    id: 'routing-find-mitre-technique',
    input: { question: 'Show me detection rules covering MITRE technique T1059.' },
    expected: {
      reference:
        'The agent should load find-security-rules and query rules by MITRE technique — not invoke rule creation.',
      expectedSkill: 'find-security-rules',
      tool_sequence: [...FIND_RULES_TRAJECTORY],
    },
    metadata: {
      category: 'find-rules',
      routing_intent: 'MITRE Technique Query',
      dataset_split: ['base'],
      expectedOnlyToolId: FIND_RULES_TOOL_ID,
      forbiddenToolId: CREATE_RULE_TOOL_ID,
      tool_sequence: [...FIND_RULES_TRAJECTORY],
    },
  },
  {
    id: 'routing-find-custom-count',
    input: { question: 'How many custom (non-prebuilt) detection rules do I have enabled?' },
    expected: {
      reference:
        'The agent should inventory rules via find-security-rules — not generate a new rule.',
      expectedSkill: 'find-security-rules',
      tool_sequence: [...FIND_RULES_TRAJECTORY],
    },
    metadata: {
      category: 'find-rules',
      routing_intent: 'Rule Count',
      dataset_split: ['base'],
      expectedOnlyToolId: FIND_RULES_TOOL_ID,
      forbiddenToolId: CREATE_RULE_TOOL_ID,
      tool_sequence: [...FIND_RULES_TRAJECTORY],
    },
  },
];

/**
 * Adversarial find-rules examples.
 *
 * The `base` find-rules examples above all open with an unambiguous read-only verb
 * ("List all...", "Show me...", "How many...") and contain no authoring vocabulary,
 * so the router has no lexical pull toward `detection-rule-edit` and cannot
 * discriminate between a catalog with and without a disambiguation clause.
 *
 * These examples are still strictly read-only — the correct answer is always
 * find-security-rules + security.find_rules, and security.create_detection_rule is
 * always forbidden — but each one deliberately loads the prompt with creation/edit
 * signal that competes for the router's attention:
 *
 *  - leading imperative normally associated with authoring ("Audit", "Review", "Check")
 *  - rule-authoring field vocabulary (severity, risk score, index patterns, interval, query)
 *  - explicit mention of creating/editing framed as a *future or hypothetical* action
 *  - coverage-gap framing, which sits one inference step away from "so create one"
 *
 * A router that reads only surface keywords ("severity", "create", "coverage gap")
 * will misroute these to detection-rule-edit; a router that resolves the actual
 * user intent will keep them on find-security-rules.
 */
const adversarialFindRulesExamples: RuleRoutingExample[] = [
  {
    id: 'routing-find-adversarial-severity-audit',
    input: {
      question:
        'Audit my detection rules for severity and risk score consistency — which enabled rules have a severity of high or critical?',
    },
    expected: {
      reference:
        'Read-only audit of existing rule severity. The agent should load find-security-rules and call security.find_rules. It must NOT call security.create_detection_rule or edit any rule, despite the rule-authoring field vocabulary.',
      expectedSkill: 'find-security-rules',
      tool_sequence: [...FIND_RULES_TRAJECTORY],
    },
    metadata: {
      category: 'find-rules',
      routing_intent: 'Rule Discovery (adversarial: authoring field vocabulary)',
      dataset_split: ['adversarial'],
      expectedOnlyToolId: FIND_RULES_TOOL_ID,
      forbiddenToolId: CREATE_RULE_TOOL_ID,
      tool_sequence: [...FIND_RULES_TRAJECTORY],
    },
  },
  {
    id: 'routing-find-adversarial-coverage-gap',
    input: {
      question:
        'Before I create anything new, which MITRE techniques do my existing detection rules already cover?',
    },
    expected: {
      reference:
        'The user explicitly defers creation ("before I create anything new") and asks only about existing coverage. The agent should load find-security-rules and call security.find_rules. It must NOT call security.create_detection_rule.',
      expectedSkill: 'find-security-rules',
      tool_sequence: [...FIND_RULES_TRAJECTORY],
    },
    metadata: {
      category: 'find-rules',
      routing_intent: 'Rule Discovery (adversarial: explicit deferred-creation mention)',
      dataset_split: ['adversarial'],
      expectedOnlyToolId: FIND_RULES_TOOL_ID,
      forbiddenToolId: CREATE_RULE_TOOL_ID,
      tool_sequence: [...FIND_RULES_TRAJECTORY],
    },
  },
  {
    id: 'routing-find-adversarial-query-review',
    input: {
      question:
        'Review the ES|QL queries and index patterns on my enabled rules so I can see which ones run against logs-endpoint.events.*',
    },
    expected: {
      reference:
        'Read-only review of existing rule queries and index patterns. The agent should load find-security-rules and call security.find_rules. It must NOT call security.create_detection_rule or attempt to rewrite any query.',
      expectedSkill: 'find-security-rules',
      tool_sequence: [...FIND_RULES_TRAJECTORY],
    },
    metadata: {
      category: 'find-rules',
      routing_intent: 'Rule Discovery (adversarial: query/index-pattern edit vocabulary)',
      dataset_split: ['adversarial'],
      expectedOnlyToolId: FIND_RULES_TOOL_ID,
      forbiddenToolId: CREATE_RULE_TOOL_ID,
      tool_sequence: [...FIND_RULES_TRAJECTORY],
    },
  },
  {
    id: 'routing-find-adversarial-tuning-candidates',
    input: {
      question:
        'Which of my detection rules are candidates for tuning? Show me the enabled ones tagged with MITRE and their current interval.',
    },
    expected: {
      reference:
        'The user asks to identify tuning candidates, not to perform tuning. The agent should load find-security-rules and call security.find_rules. It must NOT call security.create_detection_rule or modify a rule schedule.',
      expectedSkill: 'find-security-rules',
      tool_sequence: [...FIND_RULES_TRAJECTORY],
    },
    metadata: {
      category: 'find-rules',
      routing_intent: 'Rule Discovery (adversarial: tuning framing + schedule field)',
      dataset_split: ['adversarial'],
      expectedOnlyToolId: FIND_RULES_TOOL_ID,
      forbiddenToolId: CREATE_RULE_TOOL_ID,
      tool_sequence: [...FIND_RULES_TRAJECTORY],
    },
  },
  {
    id: 'routing-find-adversarial-duplicate-check',
    input: {
      question:
        'I want to detect password-protected archive creation on Windows. Do I already have a rule for that?',
    },
    expected: {
      reference:
        'The user states a detection intent but asks a duplicate-check question ("do I already have a rule"). The correct action is to search existing rules via find-security-rules, NOT to create the rule they described.',
      expectedSkill: 'find-security-rules',
      tool_sequence: [...FIND_RULES_TRAJECTORY],
    },
    metadata: {
      category: 'find-rules',
      routing_intent: 'Rule Discovery (adversarial: verbatim detection intent + duplicate check)',
      dataset_split: ['adversarial'],
      expectedOnlyToolId: FIND_RULES_TOOL_ID,
      forbiddenToolId: CREATE_RULE_TOOL_ID,
      tool_sequence: [...FIND_RULES_TRAJECTORY],
    },
  },
];

const distractorExamples: RuleRoutingExample[] = [
  {
    id: 'routing-distractor-dashboards',
    input: { question: 'Show me the available dashboards in Kibana.' },
    expected: {
      reference: 'Platform query — should not load find-security-rules or create a detection rule.',
      shouldNotActivateSkill: 'find-security-rules',
    },
    metadata: {
      category: 'distractor',
      routing_intent: 'Platform',
      dataset_split: ['distractor'],
      is_distractor: true,
      forbiddenToolId: CREATE_RULE_TOOL_ID,
    },
  },
  {
    id: 'routing-distractor-apm',
    input: { question: 'What is the current status of my APM services?' },
    expected: {
      reference: 'Observability query — should not create a detection rule.',
      shouldNotActivateSkill: 'find-security-rules',
    },
    metadata: {
      category: 'distractor',
      routing_intent: 'Observability',
      dataset_split: ['distractor'],
      is_distractor: true,
      forbiddenToolId: CREATE_RULE_TOOL_ID,
    },
  },
];

export const ruleRoutingExamples: RuleRoutingExample[] = [
  ...ruleCreationExamples,
  ...findRulesExamples,
  ...adversarialFindRulesExamples,
  ...distractorExamples,
];

export const ruleCreationRoutingExamples = ruleCreationExamples;
export const findRulesRoutingExamples = findRulesExamples;
export const adversarialFindRulesRoutingExamples = adversarialFindRulesExamples;
export const routingDistractorExamples = distractorExamples;
