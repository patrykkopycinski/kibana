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
  ARGUS_RUN_BACKTEST_TOOL_ID,
} from '../../tools/argus_playbooks';
import { ARGUS_ASSESS_CVE_SKILL_ID } from './constants';

export const argusAssessCveSkill = defineSkillType({
  id: ARGUS_ASSESS_CVE_SKILL_ID,
  name: ARGUS_ASSESS_CVE_SKILL_ID,
  basePath: 'skills/security/argus/playbooks',
  description:
    'Assess a specific CVE from the ARGUS perspective: is it on our radar, does an advisory ' +
    'exist in `.soc-cve-advisories`, and do we already have coverage? Optionally files a ' +
    'cti_ingest mutation intent to trigger the Exploit-to-Detection pipeline for this CVE. ' +
    'Use when the user pastes a CVE id and asks "do we cover CVE-YYYY-NNNN?" or "should we ' +
    'respond to this advisory?".',
  content: `# ARGUS · Assess CVE

## When to use this skill

Use this skill when a user names a specific CVE and wants ARGUS's view of it.
Typical prompts:

- "Do we cover CVE-2024-12345?"
- "Assess CVE-2023-9999 and tell me if we should respond."
- "Is this advisory already on ARGUS's radar?"

## Workflow

1. **Check for an advisory.** Use \`platform.core.search\` against
   \`.soc-cve-advisories\` filtered by the CVE id. If one exists, summarise its
   status (\`ingested\`, \`synthesized\`, \`detected\`, \`applied\`, \`blocked\`).
2. **Check for existing coverage.** Use \`platform.core.search\` against
   \`.soc-recommendations\` for any mutation intent tagged with this CVE id.
   Report whether ARGUS has already synthesised a rule candidate.
3. **Trigger synthesis if warranted.** If no advisory or intent exists and the
   user wants ARGUS to act, call \`security.argus.file_mutation_intent\` with
   \`origin: 'cti_ingest'\` and include the CVE id in \`summary\`. This kicks
   off the Exploit-to-Detection reconciler.
4. **Backtest new candidates.** If synthesis produced a candidate rule, queue
   \`security.argus.run_backtest\` with a 7-day lookback so the user can see
   whether the new rule would have fired.

## Guardrails

- Do not make claims about vulnerability presence on specific hosts — that is
  the job of the exposure scanner, not this skill. Stick to detection
  readiness.
- Always quote the CVE id exactly as given. Case and hyphenation matter.
- If the CVE is not present in \`.soc-cve-advisories\` and the user has not
  asked for synthesis, stop at the "not on radar" step rather than filing
  speculative intents.`,
  getRegistryTools: () => [
    ARGUS_FILE_MUTATION_INTENT_TOOL_ID,
    ARGUS_RUN_BACKTEST_TOOL_ID,
    platformCoreTools.search,
  ],
  getInlineTools: () => [],
});
