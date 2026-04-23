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
  ARGUS_SUMMARIZE_COVERAGE_TOOL_ID,
} from '../../tools/argus_playbooks';
import { ARGUS_ASSESS_READINESS_SKILL_ID } from './constants';

export const argusAssessReadinessSkill = defineSkillType({
  id: ARGUS_ASSESS_READINESS_SKILL_ID,
  name: ARGUS_ASSESS_READINESS_SKILL_ID,
  basePath: 'skills/security/argus/playbooks',
  description:
    'Assess Argus detection readiness for a named threat profile (for example ransomware or ' +
    'supply-chain). Summarises coverage gaps against the profile, highlights the top uncovered ' +
    'techniques, and optionally files gap_analysis mutation intents so Argus can synthesise new ' +
    'rules. Use when the user asks "are we ready for X?" or "how does our coverage look against ' +
    'profile Y?".',
  content: `# Argus · Assess Readiness

## When to use this skill

Use this skill when a user wants a quick, auditable read on how prepared Argus is
against a named threat profile. Typical prompts:

- "Are we ready for ransomware?"
- "How does our coverage look against the supply-chain profile?"
- "Tell me the top gaps for profile \`apt29\`."

## Workflow

1. **Summarise coverage.** Call \`security.argus.summarize_coverage\` with the
   requested \`threat_profile_id\` and \`top_n_gaps\` (default 10). This reads
   \`.soc-coverage-gaps\` and returns the lowest-confidence techniques.
2. **Narrate the gaps.** For each gap, mention the technique id, name,
   current confidence, and the reason the gap exists. Highlight whether any of
   the gaps map to rules that already exist but have degraded.
3. **Offer to file intents.** If the user wants Argus to act, call
   \`security.argus.file_mutation_intent\` once per gap with
   \`origin: 'gap_analysis'\` and include the technique id in the \`summary\`.
   Use \`dry_run: true\` first so the user can preview the payload before
   committing.
4. **Link back to the console.** End with a deep link to the Argus Playbooks
   tab so the user can inspect the pending intents.

## Guardrails

- Never invent \`threat_profile_id\`s. If the requested profile does not resolve
  via \`security.argus.summarize_coverage\`, say so and ask for the canonical
  id rather than guessing.
- Always treat write actions as requiring explicit user confirmation.
- If \`top_n_gaps\` returns zero results, explicitly state "no open gaps" —
  do not file mutation intents speculatively.`,
  getRegistryTools: () => [
    ARGUS_SUMMARIZE_COVERAGE_TOOL_ID,
    ARGUS_FILE_MUTATION_INTENT_TOOL_ID,
    platformCoreTools.search,
  ],
  getInlineTools: () => [],
});
