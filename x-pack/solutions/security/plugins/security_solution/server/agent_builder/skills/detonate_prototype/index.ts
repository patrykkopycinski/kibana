/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — Agent Builder skill.
 *
 * Gives the agent the one capability the other endpoint skills cannot provide:
 * finding out what an unknown sample actually does, by running it on an
 * instrumented endpoint and reading the alerts Elastic Defend raised.
 */

import type { SkillDefinition } from '@kbn/agent-builder-server/skills';
import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';

import type { EndpointAppContextService } from '../../../endpoint/endpoint_app_context_services';
import type { DetonateClient } from '../../../detonate_prototype';
import { getDetonationTool, listDetonationsTool, submitDetonationTool } from './tools';
import { DETONATE_PROTOTYPE_REFERENCE } from './skill_reference';

const ID = 'detonate-sample';
const NAME = 'detonate-sample';
const BASE_PATH = 'skills/security/endpoint';

const toolName = (name: string) => `${ID}.${name}`;

export const SUBMIT_DETONATION_TOOL_ID = toolName('submit_detonation');
export const GET_DETONATION_TOOL_ID = toolName('get_detonation');
export const LIST_DETONATIONS_TOOL_ID = toolName('list_detonations');

const SYSTEM_INSTRUCTIONS = `You can detonate a file sample in an instrumented sandbox VM running Elastic Defend, and report what the sample did.

## Tools

- \`list_detonations\` — past runs, filtered by hash, filename or tag.
- \`submit_detonation\` — starts a run for a hash. Returns immediately.
- \`get_detonation\` — reads one run by task ID.

## How to run a detonation

1. **Look first.** Call \`list_detonations\` with the hash. If a completed run
   already exists, report it and stop — do not re-run a sample to reproduce an
   answer you already have, unless the analyst asks for a fresh run or the
   recorded run failed.
2. **Submit.** Call \`submit_detonation\` with the hash. The service dedups
   the same way: when a completed report already exists, the answer carries
   \`deduplicated: true\` and the task is the existing report — report it, do
   not poll it. Tell the analyst the run has started, how long it takes
   (several minutes), and give them the task ID.
3. **Poll.** Call \`get_detonation\` until \`complete\` is true. Do not guess at
   completion from elapsed time; \`complete\` is the only correct signal.
4. **Report.** Say what Elastic Defend saw, by \`event.code\` and by detection
   rule name.

## Reporting rules

- \`complete: true, failed: false, quiet: true\` — the run worked and produced no
  alerts. That is a **finding**, not a failure. Say the sample ran without
  raising anything, and name the possibilities: it is benign, it detected the
  sandbox, or there is a detection gap. Do not say the detonation "did not
  work".
- \`failed: true\` — the detonation itself failed. There is no verdict about the
  sample. Say what stage it failed at (\`last_worker_name\`) and give the details
  field if present.
- Production endpoint alerts answer "would a customer's Defend have caught
  this". Diagnostic alerts answer "did Defend observe the behaviour at all".
  When diagnostic alerts exist but production alerts do not, say so explicitly —
  that gap is the interesting part of the answer.
- Never claim a sample is safe because a run was quiet. Say what was observed
  and what that does and does not rule out.

## False-positive check before reporting quiet

A quiet run is the weakest verdict. Before reporting one, check the run's
history for prior verdicts that disagree:

1. Call \`list_detonations\` for the hash. If an earlier run of the same hash
   raised alerts, the quiet run is a suspect outlier, not the answer — say so,
   and do not report "benign".
2. Ask the analyst whether this alert fired for the same behaviour before. A
   first-seen quiet result on an alerting rule means either a new file version
   or a detection gap; both are worth escalating, neither is "safe".
3. If the analyst confirms the alert is a false positive, submit the
   confirmation as a \`detonate:quiet\` tag candidate — but the tag goes on only
   via the verdict-apply path, never by direct mutation.

A quiet verdict never closes an alert by itself. It is evidence for the human
who decides.

## Boundaries

- Detonation is by hash. You cannot detonate a file the analyst is holding.
- You cannot cancel a run.
- You cannot return raw alert documents. Point the analyst at the Detonate page
  for those.
- For isolating a host, listing endpoints or any live response action, use
  \`endpoint-response-actions\`. This skill only runs samples in a sandbox and
  never touches a real host.`;

export const createDetonateSampleSkill = (
  endpointAppContextService: EndpointAppContextService,
  getClient: () => DetonateClient
): SkillDefinition<typeof NAME, typeof BASE_PATH> =>
  defineSkillType({
    id: ID,
    name: NAME,
    basePath: BASE_PATH,
    description:
      'Detonate a file sample by hash in an instrumented sandbox VM running Elastic Defend, and report the alerts it produced: which `event.code` values Defend raised, which detection rules fired, and whether the run was quiet. Use when an analyst asks what an unknown file actually does, or wants behavioural evidence for a hash that reputation sources do not resolve. Runs take several minutes. This never touches a real host — for live response actions use endpoint-response-actions.',
    content: SYSTEM_INSTRUCTIONS,
    referencedContent: [
      {
        relativePath: '.',
        name: 'reference',
        content: DETONATE_PROTOTYPE_REFERENCE,
      },
    ],
    getInlineTools: () => [
      listDetonationsTool(endpointAppContextService, getClient),
      submitDetonationTool(endpointAppContextService, getClient),
      getDetonationTool(endpointAppContextService, getClient),
    ],
  });
