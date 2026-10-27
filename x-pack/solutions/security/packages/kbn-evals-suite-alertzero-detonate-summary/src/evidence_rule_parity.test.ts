/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import { buildSummarySystemPrompt, EVIDENCE_RULE_SECTION } from './detonate_summary_task';

// Read as text: an eval package cannot import plugin internals.
const SKILL_PATH = join(
  __dirname,
  '../../../plugins/security_solution/server/agent_builder/skills/detonate_prototype/index.ts'
);

describe('evidence rule parity', () => {
  it('pins the evidence rule verbatim from the detonate skill prompt', () => {
    expect(readFileSync(SKILL_PATH, 'utf8')).toContain(EVIDENCE_RULE_SECTION);
  });

  it('drops exactly the evidence rule in the mutation prompt', () => {
    const withRule = buildSummarySystemPrompt({ includeEvidenceRule: true });
    const withoutRule = buildSummarySystemPrompt({ includeEvidenceRule: false });
    expect(withRule).toContain(EVIDENCE_RULE_SECTION);
    expect(withoutRule).not.toContain('Evidence rule');
    expect(withRule.replace(`${EVIDENCE_RULE_SECTION}\n\n`, '')).toBe(withoutRule);
  });
});
