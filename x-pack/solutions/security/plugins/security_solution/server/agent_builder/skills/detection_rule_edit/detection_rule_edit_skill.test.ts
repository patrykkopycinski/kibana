/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isAllowedBuiltinSkill } from '@kbn/agent-builder-server/allow_lists';
import { getDetectionRuleEditSkill } from '.';

describe('detectionRuleEditSkill', () => {
  const skill = getDetectionRuleEditSkill({ rulePreviewEnabled: false });

  it('has stable metadata', () => {
    expect(skill.id).toBe('detection-rule-edit');
    expect(skill.name).toBe('detection-rule-edit');
    expect(skill.basePath).toBe('skills/security/rules');
  });

  it('uses an allow-listed built-in skill id', () => {
    expect(isAllowedBuiltinSkill(skill.id)).toBe(true);
  });

  it('description has explicit routing boundaries for authoring vs non-authoring intent', () => {
    // AutoDEX (8a00675c5011) dropped the find-security-rules disambiguation clause;
    // evidence across 3 models (Haiku/Sonnet/Opus, 94 clean find-rules executions,
    // zero misroutes) shows the clause is unnecessary. Assert against actual content.
    expect(skill.description).toMatch(/author or modify a detection rule/i);
    expect(skill.description).toMatch(/implied authoring intent/i);
    expect(skill.description).toMatch(/not for alert triage/i);
  });

  it('content has a "Do NOT use" section with clear exclusions', () => {
    expect(skill.content).toMatch(/Do NOT use this skill when/i);
    expect(skill.content).toMatch(/alerts or alert triage/i);
    expect(skill.content).toMatch(/threat hunting without any intent/i);
  });

  it('description stays under 1024 characters', () => {
    expect(skill.description.length).toBeLessThanOrEqual(1024);
  });
});
