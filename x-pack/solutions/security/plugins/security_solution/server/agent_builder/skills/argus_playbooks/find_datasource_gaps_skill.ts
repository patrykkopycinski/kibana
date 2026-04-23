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
import { ARGUS_FIND_DATASOURCE_GAPS_SKILL_ID } from './constants';

export const argusFindDatasourceGapsSkill = defineSkillType({
  id: ARGUS_FIND_DATASOURCE_GAPS_SKILL_ID,
  name: ARGUS_FIND_DATASOURCE_GAPS_SKILL_ID,
  basePath: 'skills/security/argus/playbooks',
  description:
    'Surface detection gaps grouped by data source (endpoint, network, identity, cloud, etc.) ' +
    'rather than by technique. Reports which sources ARGUS currently relies on for high-' +
    'confidence detections and which techniques would become blind if a given source went ' +
    'dark. Use when the user asks "which data sources are we missing?" or "what would we lose ' +
    'without EDR?".',
  content: `# ARGUS · Find Datasource Gaps

## When to use this skill

Use this skill when a user wants to understand detection dependencies on data
sources rather than on techniques. Typical prompts:

- "Which data sources are we over-relying on?"
- "What would we lose if our EDR went dark?"
- "Do we have gaps from missing identity logs?"

## Workflow

1. **Pull coverage.** Call \`security.argus.summarize_coverage\` with a
   generous \`top_n_gaps\` (e.g. 50) so the response captures enough techniques
   to bucket by source.
2. **Bucket by \`primary_source\`.** For each technique, group by the
   \`primary_source\` field returned by the coverage store. Report per-source:
   number of techniques, average confidence, and top 3 techniques whose
   confidence would collapse if the source went dark.
3. **Call out single-source dependencies.** Any technique whose coverage comes
   from exactly one source is fragile — ARGUS's ability to detect that
   technique depends entirely on that source.
4. **Offer to file intents.** Where single-source dependencies exist, the user
   may request a \`gap_analysis\` intent asking ARGUS to look for an
   alternative rule that uses a second source. Use
   \`security.argus.file_mutation_intent\` with \`origin: 'gap_analysis'\` and
   include the technique id and missing source in \`summary\`.

## Guardrails

- Do not claim a source is "covered" without reporting the count of
  techniques tied to it. The answer must be quantitative.
- If \`summarize_coverage\` returns no \`primary_source\` for some techniques,
  list them separately under "unclassified" rather than dropping them.`,
  getRegistryTools: () => [
    ARGUS_SUMMARIZE_COVERAGE_TOOL_ID,
    ARGUS_FILE_MUTATION_INTENT_TOOL_ID,
    platformCoreTools.search,
  ],
  getInlineTools: () => [],
});
