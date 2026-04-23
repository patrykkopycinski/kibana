/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { platformCoreTools } from '@kbn/agent-builder-common';
import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';

import {
  ARGUS_FILE_MUTATION_INTENT_TOOL_ID,
  ARGUS_OPEN_INVESTIGATION_TOOL_ID,
  ARGUS_RUN_BACKTEST_TOOL_ID,
  ARGUS_SUMMARIZE_COVERAGE_TOOL_ID,
} from '../../tools/argus_playbooks';
import { ARGUS_RUN_PURPLE_TEAM_SKILL_ID } from './constants';

export const argusRunPurpleTeamSkill = defineSkillType({
  id: ARGUS_RUN_PURPLE_TEAM_SKILL_ID,
  name: ARGUS_RUN_PURPLE_TEAM_SKILL_ID,
  basePath: 'skills/security/argus/playbooks',
  description:
    'Run a short, structured purple-team review for a given threat profile. Combines coverage ' +
    'summary, rule backtests, gap_analysis intent filing, and an optional case so the result is ' +
    'auditable. Use when the user wants a deeper, multi-step exercise than ' +
    'argus-assess-readiness provides, or asks to "run a purple team" or "do a joint exercise".',
  content: `# Argus · Run Purple Team

## When to use this skill

Use this skill when a user wants a multi-step, auditable purple-team run, not
just a readiness snapshot. Typical prompts:

- "Run a purple team for the ransomware profile."
- "Do a joint exercise against our phishing playbook."
- "Stress-test our coverage for profile \`apt29\` and tell me what to fix."

## Workflow

1. **Scope.** Ask the user for the target \`threat_profile_id\`. Do not invent
   profiles — echo the allowed list from \`summarize_coverage\` if unsure.
2. **Summarise coverage.** Call \`security.argus.summarize_coverage\` with
   \`top_n_gaps: 15\` so the exercise is meaningful but bounded.
3. **Backtest existing rules.** For each rule that claims the target's top
   techniques, call \`security.argus.run_backtest\` with a 30-day lookback.
4. **File gap_analysis intents.** For every technique still showing
   confidence < 0.5 after the backtests, call
   \`security.argus.file_mutation_intent\` with \`origin: 'gap_analysis'\` and
   \`dry_run: false\` (the user explicitly asked for a run).
5. **Open an investigation.** Create a case via
   \`security.argus.open_investigation\` that links to the filed intents so an
   analyst can track outcomes.
6. **Summarise.** End with a short report: "Covered / Gaps filed / Rules
   backtested / Case id". Keep it under 15 lines.

## Guardrails

- This is a **write-heavy** skill. Confirm the profile and ask "proceed?" once
  before any non-dry-run tool call.
- If any backtest fails with a hard error, stop, surface the error, and do not
  continue to file gap intents — a broken backtest corpus invalidates the
  exercise.
- Link every filed intent in the closing summary so the user can inspect them
  from the Argus Playbooks tab.`,
  getRegistryTools: () => [
    ARGUS_SUMMARIZE_COVERAGE_TOOL_ID,
    ARGUS_RUN_BACKTEST_TOOL_ID,
    ARGUS_FILE_MUTATION_INTENT_TOOL_ID,
    ARGUS_OPEN_INVESTIGATION_TOOL_ID,
    platformCoreTools.search,
  ],
  getInlineTools: () => [],
});
