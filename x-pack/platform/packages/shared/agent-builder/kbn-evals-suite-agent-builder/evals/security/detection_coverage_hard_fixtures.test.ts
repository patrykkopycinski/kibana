/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  HARD_COVERAGE_FIXTURE_RULES,
  buildHardRuleBody,
  buildHardRuleTechnique,
} from './detection_coverage_hard_fixtures';

interface SeededSubtechnique {
  id: string;
  name: string;
  reference: string;
}
interface SeededTechnique {
  id: string;
  name: string;
  reference: string;
  subtechnique?: SeededSubtechnique[];
}
interface SeededThreat {
  technique: SeededTechnique[];
}

// Mirrors the dotted-id routing in security.find_rules: `^(AML\.)?T\d{4}\.\d{3}$`.
const SUBTECHNIQUE_REGEX = /^((?:AML\.)?T\d{4})\.\d{3}$/i;

const getThreat = (body: Record<string, unknown>): SeededThreat[] => body.threat as SeededThreat[];

// The values `find_rules` would match for `threat.technique.id` / `threat.technique.subtechnique.id`.
const techniqueIds = (threats: SeededThreat[]): string[] =>
  threats.flatMap((t) => t.technique.map((tech) => tech.id));
const subtechniqueIds = (threats: SeededThreat[]): string[] =>
  threats.flatMap((t) => t.technique.flatMap((tech) => (tech.subtechnique ?? []).map((s) => s.id)));

describe('detection_coverage_hard fixtures: MITRE seed shape', () => {
  it('seeds a non-empty rule set that includes subtechnique rules', () => {
    expect(HARD_COVERAGE_FIXTURE_RULES.length).toBeGreaterThan(0);
    expect(HARD_COVERAGE_FIXTURE_RULES.some((r) => SUBTECHNIQUE_REGEX.test(r.technique))).toBe(
      true
    );
  });

  describe.each(HARD_COVERAGE_FIXTURE_RULES.map((rule) => [rule.name, rule] as const))(
    '%s',
    (_name, rule) => {
      const threats = getThreat(buildHardRuleBody(rule));
      const subMatch = SUBTECHNIQUE_REGEX.exec(rule.technique);

      it('is found by a parent-id query on threat.technique.id', () => {
        const parentId = subMatch ? subMatch[1] : rule.technique;
        expect(techniqueIds(threats)).toContain(parentId);
      });

      it('never puts a dotted subtechnique id in technique[].id', () => {
        for (const id of techniqueIds(threats)) {
          expect(id).not.toMatch(/\./);
        }
      });

      it('is found by a dotted-id query on threat.technique.subtechnique.id when the id is dotted', () => {
        if (subMatch) {
          expect(subtechniqueIds(threats)).toEqual([rule.technique]);
        } else {
          expect(subtechniqueIds(threats)).toEqual([]);
        }
      });
    }
  );

  describe('buildHardRuleTechnique', () => {
    it('nests a dotted id under its parent with MITRE-style references', () => {
      expect(buildHardRuleTechnique('T1218.011')).toEqual({
        id: 'T1218',
        name: 'T1218',
        reference: 'https://attack.mitre.org/techniques/T1218/',
        subtechnique: [
          {
            id: 'T1218.011',
            name: 'T1218.011',
            reference: 'https://attack.mitre.org/techniques/T1218/011/',
          },
        ],
      });
    });

    it('keeps a parent id flat, without a subtechnique array', () => {
      expect(buildHardRuleTechnique('T1047')).toEqual({
        id: 'T1047',
        name: 'T1047',
        reference: 'https://attack.mitre.org/techniques/T1047/',
      });
    });

    it('splits AML-prefixed dotted ids the same way the find_rules regex routes them', () => {
      const technique = buildHardRuleTechnique('AML.T0051.000') as SeededTechnique;
      expect(technique.id).toBe('AML.T0051');
      expect(technique.subtechnique?.map((s) => s.id)).toEqual(['AML.T0051.000']);
    });
  });
});
