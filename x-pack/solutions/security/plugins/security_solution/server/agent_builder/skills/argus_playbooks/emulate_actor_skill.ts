/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { platformCoreTools } from '@kbn/agent-builder-common';
import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';

import {
  ARGUS_OPEN_INVESTIGATION_TOOL_ID,
  ARGUS_RUN_BACKTEST_TOOL_ID,
  ARGUS_SUMMARIZE_COVERAGE_TOOL_ID,
} from '../../tools/argus_playbooks';
import { ARGUS_EMULATE_ACTOR_SKILL_ID } from './constants';

export const argusEmulateActorSkill = defineSkillType({
  id: ARGUS_EMULATE_ACTOR_SKILL_ID,
  name: ARGUS_EMULATE_ACTOR_SKILL_ID,
  basePath: 'skills/security/argus/playbooks',
  description:
    'Run an actor-focused coverage review for a named threat actor (for example APT29, ' +
    'FIN7, or a synthetic frontier actor). Correlates the actor\'s MITRE techniques against ' +
    'recent telemetry, summarises which techniques would likely escape detection today, and ' +
    'optionally opens a case so an analyst can track the follow-up. Use when the user asks ' +
    '"how would we fare against actor X?" or "emulate this adversary".',
  content: `# Argus · Emulate Actor

## When to use this skill

Use this skill when a user names a threat actor and wants to know how Argus would
respond if the actor were active today. Typical prompts:

- "How would we fare against APT29?"
- "Emulate FIN7 and tell me our weak spots."
- "Do we have coverage for the techniques this actor relies on?"

## Workflow

1. **Fetch actor coverage.** Call \`security.argus.summarize_coverage\` with the
   actor's \`threat_profile_id\` (one profile per actor in the demo). This
   returns the techniques the actor favours together with Argus's confidence
   per technique.
2. **Identify the highest-risk techniques.** Surface those with confidence
   below 0.5 first; these are the techniques most likely to escape detection.
3. **Backtest any rules that already claim to cover the actor's techniques.**
   For every rule mentioned in the coverage summary, optionally queue
   \`security.argus.run_backtest\` with a 30-day lookback so the user can see
   whether the rule fires on recent telemetry.
4. **Offer an investigation.** When the user wants a paper trail, call
   \`security.argus.open_investigation\` with \`subject_kind: 'actor'\` and the
   actor id. This creates a Security Solution case pre-populated with the
   coverage summary.

## Guardrails

- Do not claim an actor is "fully covered" unless every technique returned by
  \`summarize_coverage\` has confidence >= 0.8.
- If the user asks for a live telemetry sweep and the telemetry lookback window
  is empty, state that explicitly — do not fabricate activity.
- Preserve actor id casing exactly as returned by the coverage tool; downstream
  deep links are case-sensitive.`,
  getRegistryTools: () => [
    ARGUS_SUMMARIZE_COVERAGE_TOOL_ID,
    ARGUS_RUN_BACKTEST_TOOL_ID,
    ARGUS_OPEN_INVESTIGATION_TOOL_ID,
    platformCoreTools.search,
  ],
  getInlineTools: () => [],
});
