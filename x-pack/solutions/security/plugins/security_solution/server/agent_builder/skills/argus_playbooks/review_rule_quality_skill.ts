/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { platformCoreTools } from '@kbn/agent-builder-common';
import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';

import { ARGUS_REVIEW_RULE_QUALITY_SKILL_ID } from './constants';

/**
 * Pure-read skill. Per the argus-playbook-primitives spec, this skill MUST NOT
 * invoke any workflow and MUST NOT write to any index. It only reads
 * `.soc-recommendations` and `.soc-backtests` via `platform.core.search`
 * and returns a narrative.
 */
export const argusReviewRuleQualitySkill = defineSkillType({
  id: ARGUS_REVIEW_RULE_QUALITY_SKILL_ID,
  name: ARGUS_REVIEW_RULE_QUALITY_SKILL_ID,
  basePath: 'skills/security/argus/playbooks',
  description:
    'Review the quality of a specific detection rule from the ARGUS perspective: recent ' +
    'backtest metrics (true positives, false positives, windows), ARGUS governance decisions ' +
    '(applied, blocked, rolled back, and why), and the rule\'s trajectory over time. This is ' +
    'a read-only skill — it never writes. Use when the user asks "how good is rule X?", ' +
    '"should we keep rule X?", or "show me the quality history of this rule".',
  content: `# ARGUS · Review Rule Quality

## When to use this skill

Use this skill when a user wants an ARGUS-lens review of a specific detection
rule, without triggering any mutation. Typical prompts:

- "Review the quality of rule \`rule-123\`."
- "Should we keep this rule? Show me its quality history."
- "Why did ARGUS block rule X? Tell me what the backtests say."

## Workflow (read-only)

1. **Identify the rule.** Require a \`rule_id\`. If the user gives a rule
   *name*, refuse gracefully — ids are unambiguous, names are not.
2. **Read recent backtests.** Use \`platform.core.search\` against
   \`.soc-backtests\` filtered by \`rule_id\`, sorted by
   \`@timestamp\` desc, size 10. Summarise TP/FP counts, windows, and any
   failure reasons.
3. **Read recent governance decisions.** Use \`platform.core.search\` against
   \`.soc-recommendations\` filtered by \`rule_id\` (or the proposed rule's
   canonical id) for intents, outcomes, and rollback reasons.
4. **Narrate trajectory.** Describe the rule's quality over time: improving,
   degrading, stable, or noisy. Call out any blocked or rolled-back
   mutations by reason.
5. **Recommend — do not act.** Suggest what the operator might do next
   (e.g. file a gap_analysis intent, open an investigation), but never invoke
   any write tool here.

## Guardrails (MUST)

- This skill is **strictly read-only**. Do not call
  \`security.argus.file_mutation_intent\`, \`security.argus.run_backtest\`,
  \`security.argus.open_investigation\`, \`security.argus.approve_reject_mutation\`,
  or \`security.argus.toggle_kill_switch\`. Only \`platform.core.search\` is
  permitted.
- If the user presses for a write action, suggest switching to
  \`argus-assess-readiness\` or \`argus-run-purple-team\` instead.
- If no backtests exist for the rule, state that explicitly — "no backtest
  history" is a legitimate finding.`,
  getRegistryTools: () => [platformCoreTools.search],
  getInlineTools: () => [],
});
