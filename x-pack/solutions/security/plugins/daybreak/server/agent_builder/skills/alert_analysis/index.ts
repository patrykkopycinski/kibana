/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SkillDefinition } from '@kbn/agent-builder-server/skills';
import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import { confirmEvidenceReceivedTool } from './confirm_evidence_received_tool';

const ID = 'daybreak-alert-analysis';
const NAME = 'daybreak-alert-analysis';
const BASE_PATH = 'skills/security/alerts';

const systemInstructions = `# Daybreak Alert Analysis

Use this skill to triage security alerts and produce a structured verdict.

## Tool

- \`daybreak-alert-analysis.confirm_evidence_received\`: confirms the alert evidence has been received. Call this tool exactly once, then return the final JSON verdict.

## Output format

After calling the confirmation tool, return ONLY a JSON object with three fields:
- \`verdict\`: one of true_positive, false_positive, benign_true_positive, needs_evidence
- \`confidence\`: a number between 0 and 1
- \`rationale\`: a short string explaining the verdict
`;

export const createDaybreakAlertAnalysisSkill = (): SkillDefinition<typeof NAME, typeof BASE_PATH> => {
  return defineSkillType({
    id: ID,
    name: NAME,
    basePath: BASE_PATH,
    description:
      'Triage security alerts and emit a structured verdict (true_positive, false_positive, benign_true_positive, needs_evidence).',
    content: systemInstructions,
    getInlineTools: () => [confirmEvidenceReceivedTool()],
  });
};
