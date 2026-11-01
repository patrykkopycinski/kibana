/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  COVERAGE_GAP_CASES,
  HARD_COVERAGE_FIXTURE_RULES,
  HARD_RULE_PREFIX,
  MITRE_TACTIC_NAMES,
  MITRE_TECHNIQUE_INTEL,
  buildHardRuleBody,
  buildHardRuleTechnique,
  buildHardRuleThreat,
  deriveVerdictFromSeed,
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
  tactic: { id: string; name: string };
  technique: SeededTechnique[];
}

// Mirrors the dotted-id routing in security.find_rules: `^(AML\.)?T\d{4}\.\d{3}$`.
const SUBTECHNIQUE_REGEX = /^((?:AML\.)?T\d{4})\.\d{3}$/i;

const getThreat = (body: Record<string, unknown>): SeededThreat[] => body.threat as SeededThreat[];

const techniqueIds = (threats: SeededThreat[]): string[] =>
  threats.flatMap((t) => t.technique.map((tech) => tech.id));
const subtechniqueIds = (threats: SeededThreat[]): string[] =>
  threats.flatMap((t) => t.technique.flatMap((tech) => (tech.subtechnique ?? []).map((s) => s.id)));

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9.\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'that',
  'the',
  'their',
  'this',
  'through',
  'to',
  'via',
  'was',
  'were',
  'with',
  'not',
  'into',
  'than',
  'then',
  'when',
  'which',
  'one',
  'other',
  'over',
]);

/** Longest run of identical consecutive words shared by both texts. */
const longestSharedRun = (a: string[], b: string[]): number => {
  let best = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      let run = 0;
      while (i + run < a.length && j + run < b.length && a[i + run] === b[j + run]) run++;
      best = Math.max(best, run);
    }
  }
  return best;
};

const caseById = new Map(COVERAGE_GAP_CASES.map((c) => [c.id, c]));

describe('detection_coverage_hard fixtures: MITRE seed shape', () => {
  it('seeds a non-empty rule set that includes subtechnique rules', () => {
    expect(HARD_COVERAGE_FIXTURE_RULES.length).toBeGreaterThan(0);
    expect(HARD_COVERAGE_FIXTURE_RULES.some((r) => SUBTECHNIQUE_REGEX.test(r.technique))).toBe(
      true
    );
  });

  it('seeds 67 rules: 33 exact, 19 near-miss, 15 decoy', () => {
    expect(HARD_COVERAGE_FIXTURE_RULES).toHaveLength(67);
    const kinds = { exact: 0, near_miss: 0, decoy: 0 } as Record<string, number>;
    for (const r of HARD_COVERAGE_FIXTURE_RULES) kinds[r.kind]++;
    expect(kinds).toEqual({ exact: 33, near_miss: 19, decoy: 15 });
  });

  it('keeps the derived verdict per case unchanged', () => {
    // Snapshot pins the expectedVerdict map and the seed-derived verdict for every case.
    const verdicts = Object.fromEntries(
      COVERAGE_GAP_CASES.map((c) => [c.id, [c.expectedVerdict, deriveVerdictFromSeed(c)]])
    );
    expect(verdicts).toMatchSnapshot();
    for (const c of COVERAGE_GAP_CASES) {
      if (c.expectedVerdict === 'covered_enabled' || c.expectedVerdict === 'covered_disabled') {
        expect(deriveVerdictFromSeed(c)).toBe(c.expectedVerdict);
      } else {
        expect(deriveVerdictFromSeed(c)).toBe('needs_catalog');
      }
    }
  });

  it('has no exact rule description leaking the gap sentence', () => {
    for (const rule of HARD_COVERAGE_FIXTURE_RULES.filter((r) => r.kind === 'exact')) {
      const gap = caseById.get(rule.caseId)!.gap;
      expect(rule.description).not.toContain(gap);
      expect(longestSharedRun(words(rule.description), words(gap))).toBeLessThanOrEqual(5);
    }
  });

  it('has no seeded rule query referencing threat.technique or threat.tactic', () => {
    for (const rule of HARD_COVERAGE_FIXTURE_RULES) {
      expect(rule.query).not.toMatch(/threat\.(technique|tactic)/);
    }
  });

  it('names no rule with a kind marker or a case id', () => {
    for (const rule of HARD_COVERAGE_FIXTURE_RULES) {
      expect(rule.name.toLowerCase()).not.toMatch(/\b(decoy|near)\b|near.?miss/);
      expect(rule.name).not.toContain(rule.caseId);
    }
  });

  it('names every decoy after a distinctive word from its gap', () => {
    for (const rule of HARD_COVERAGE_FIXTURE_RULES.filter((r) => r.kind === 'decoy')) {
      const gapWords = new Set(words(caseById.get(rule.caseId)!.gap));
      const nameWords = new Set(words(rule.name.slice(HARD_RULE_PREFIX.length)));
      const shared = [...nameWords].filter((w) => gapWords.has(w) && !STOPWORDS.has(w));
      expect(shared).not.toEqual([]);
    }
  });

  describe.each(HARD_COVERAGE_FIXTURE_RULES.map((rule) => [rule.name, rule] as const))(
    '%s',
    (_name, rule) => {
      const threats = getThreat(buildHardRuleBody(rule));
      const subMatch = SUBTECHNIQUE_REGEX.exec(rule.technique);

      it('has the shape a parent-id query on threat.technique.id routes to', () => {
        const parentId = subMatch ? subMatch[1] : rule.technique;
        expect(techniqueIds(threats)).toContain(parentId);
      });

      it('never puts a dotted subtechnique id in technique[].id', () => {
        for (const id of techniqueIds(threats)) {
          expect(id).not.toMatch(/\./);
        }
      });

      it('has the shape a dotted-id query on threat.technique.subtechnique.id routes to when the id is dotted', () => {
        if (subMatch) {
          expect(subtechniqueIds(threats)).toEqual([rule.technique]);
        } else {
          expect(subtechniqueIds(threats)).toEqual([]);
        }
      });

      it('carries the technique real MITRE name, not the raw id', () => {
        const expected = MITRE_TECHNIQUE_INTEL[rule.technique];
        expect(expected).toBeDefined();
        for (const tech of threats.flatMap((t) => t.technique)) {
          expect(tech.name).toBe(MITRE_TECHNIQUE_INTEL[tech.id]?.name ?? tech.id);
        }
        const seededSub = threats.flatMap((t) => t.technique.flatMap((x) => x.subtechnique ?? []));
        for (const sub of seededSub) {
          expect(sub.name).toBe(MITRE_TECHNIQUE_INTEL[sub.id]?.name ?? sub.id);
        }
      });

      it('carries a tactic the technique actually belongs to', () => {
        const expected = MITRE_TECHNIQUE_INTEL[rule.technique];
        for (const threat of threats) {
          expect(expected?.tactics).toContain(threat.tactic.id);
          expect(threat.tactic.name).toBe(MITRE_TACTIC_NAMES[threat.tactic.id]);
        }
      });
    }
  );

  describe('MITRE_TECHNIQUE_INTEL vs the repo MITRE data', () => {
    // The solutions-side module cannot be imported across the package boundary, so its
    // generated file is read and parsed instead. Techniques missing there (revoked in
    // v19.2, mobile/ICS) are skipped; every other entry must match name and first tactic.
    const MITRE_TS = resolve(
      __dirname,
      '../../../../../../../../x-pack/solutions/security/plugins/security_solution/common/detection_engine/mitre/mitre_tactics_techniques.ts'
    );

    const parseGeneratedMitre = () => {
      const src = readFileSync(MITRE_TS, 'utf8');
      const intel = new Map<string, { name: string; tacticNames: string[] }>();
      for (const m of src.matchAll(
        /id: '([^']+)',\s*name: '([^']+)',\s*reference:[^}]*?tactics: \[([^\]]*)\]/gs
      )) {
        // Tactic dash shortnames ('credential-access') map to title-cased tactic names.
        const tacticNames = [...m[3].matchAll(/'([a-z-]+)'/g)].map((t) =>
          t[1]
            .split('-')
            .map((w) => w[0].toUpperCase() + w.slice(1))
            .join(' ')
        );
        intel.set(m[1], { name: m[2], tacticNames });
      }
      return intel;
    };

    it('matches name and tactic set for every technique present in the generated file', () => {
      const generated = parseGeneratedMitre();
      const handAdded: string[] = [];
      for (const [id, entry] of Object.entries(MITRE_TECHNIQUE_INTEL)) {
        const repo = generated.get(id);
        if (!repo) {
          handAdded.push(id);
          continue;
        }
        expect([id, entry.name]).toEqual([id, repo.name]);
        expect(entry.tactics.map((t) => MITRE_TACTIC_NAMES[t].toLowerCase()).sort()).toEqual(
          repo.tacticNames.map((t) => t.toLowerCase()).sort()
        );
      }
      // Entries absent from the generated enterprise file (revoked):
      expect(handAdded.sort()).toEqual([
        'T1070.001',
        'T1562',
        'T1562.001',
        'T1562.004',
        'T1562.008',
        'T1574.002',
      ]);
    });
  });

  describe('surface-leak hardening', () => {
    // P1-1: a trivial classifier keyed on hedge/disclaimer prose used to separate near-miss
    // rules from exact rules. Near-miss descriptions must read like exact-rule prose.
    const HEDGE_PHRASES: RegExp[] = [
      /\brather than\b/i,
      /\bnot the (creation|same|actual)\b/i,
      /\bwithout (execution|covering|requiring)\b/i,
      /\bdistinct from\b/i,
      /\bcomplement(s|ing)?\b/i,
      /\binstead of\b/i,
      /\bignoring\b/i,
      /\bhygiene gap\b/i,
      /\bpartial(ly)?\b/i,
      /\bdoes not (cover|detect)\b/i,
      /\bonly (monitors|covers|alerts)\b/i,
    ];

    it('near-miss descriptions carry no hedge or disclaimer phrase', () => {
      const nearMisses = HARD_COVERAGE_FIXTURE_RULES.filter((r) => r.kind === 'near_miss');
      for (const rule of nearMisses) {
        for (const phrase of HEDGE_PHRASES) {
          expect([rule.name, phrase.test(rule.description)]).toEqual([rule.name, false]);
        }
      }
    });

    it('near-miss and exact description distributions overlap: median gap < 15 and IQR overlap', () => {
      const lens = (kind: string) =>
        HARD_COVERAGE_FIXTURE_RULES.filter((r) => r.kind === kind).map((r) => r.description.length);
      const stats = (xs: number[]) => {
        const s = [...xs].sort((a, b) => a - b);
        const q = (p: number) => s[Math.min(s.length - 1, Math.round(p * (s.length - 1)))];
        return { q1: q(0.25), med: q(0.5), q3: q(0.75) };
      };
      const exact = stats(lens('exact'));
      for (const kind of ['near_miss', 'decoy']) {
        const other = stats(lens(kind));
        expect([kind, Math.abs(other.med - exact.med) < 15]).toEqual([kind, true]);
        // Interquartile ranges must overlap, not just the min/max envelopes.
        expect([kind, other.q1 <= exact.q3 && exact.q1 <= other.q3]).toEqual([kind, true]);
      }
      const byVerb = (kind: string) =>
        new Set(
          HARD_COVERAGE_FIXTURE_RULES.filter((r) => r.kind === kind).map(
            (r) => /^[A-Z][a-z]+/.exec(r.description)?.[0]
          )
        );
      // No leading verb may be exclusive to one kind (a trivial separator).
      const allVerbs = new Set(
        HARD_COVERAGE_FIXTURE_RULES.map((r) => /^[A-Z][a-z]+/.exec(r.description)?.[0])
      );
      for (const verb of allVerbs) {
        const kindsUsing = (['exact', 'near_miss', 'decoy'] as const).filter((k) =>
          byVerb(k).has(verb)
        );
        expect([verb, kindsUsing.length >= 2]).toEqual([verb, true]);
      }
    });

    it('no decoy query references the distinctive entities of its own case gap behaviour', () => {
      // Pairs pinned from the review: a decoy firing on its own gap's events makes
      // covered_enabled a defensible answer instead of the expected verdict.
      const forbidden: Readonly<Record<string, RegExp>> = {
        G02: /rundll32|user.?writable|user.?profile/i,
        G06: /net\.exe|sc\.exe|\bstop\b/i,
        G10: /fodhelper\.exe|ms-settings/i,
        G13: /wevtutil|clear.?log/i,
        G20: /appdata|program files|teamviewer\.exe|anydesk\.exe/i,
        G26: /response_text|tunnell?ing|txt/i,
        G30: /users\\\\|system32/i,
        G33: /169\.254\.169\.254|metadata/i,
        G37: /listbucket|storage\.objects\.list|unrecognised/i,
        G41: /paste/i,
        G45: /push\/notify|approval|prompts.*flood/i,
        G50: /dcshadow|replication/i,
        G52: /implant|unexpected.*device/i,
        G56: /vmware|virtualbox|hypervisor.*check/i,
        G59: /disable.*log|stop.*trail/i,
      };
      for (const rule of HARD_COVERAGE_FIXTURE_RULES.filter((r) => r.kind === 'decoy')) {
        const pattern = forbidden[rule.caseId];
        expect(pattern).toBeDefined();
        expect([rule.name, pattern!.test(rule.query)]).toEqual([rule.name, false]);
      }
    });

    it('decoy techniques are diversified: no technique id covers 8 or more of 15 decoys', () => {
      const decoys = HARD_COVERAGE_FIXTURE_RULES.filter((r) => r.kind === 'decoy');
      expect(decoys).toHaveLength(15);
      const byTechnique = new Map<string, number>();
      for (const d of decoys) byTechnique.set(d.technique, (byTechnique.get(d.technique) ?? 0) + 1);
      for (const [technique, count] of byTechnique) {
        expect([technique, count >= 8]).toEqual([technique, false]);
      }
    });

    it('decoy query domains are diversified: no event.category value covers 8 or more of 15 decoys', () => {
      const decoys = HARD_COVERAGE_FIXTURE_RULES.filter((r) => r.kind === 'decoy');
      const byCategory = new Map<string, number>();
      for (const d of decoys) {
        for (const m of d.query.matchAll(/event\.category:"([a-z]+)"/g)) {
          byCategory.set(m[1], (byCategory.get(m[1]) ?? 0) + 1);
        }
      }
      for (const [category, count] of byCategory) {
        expect([category, count >= 8]).toEqual([category, false]);
      }
    });

    it('no decoy query shares its own case technique or covers any case gap technique', () => {
      const caseTechniques = new Set(COVERAGE_GAP_CASES.map((c) => c.attackTechnique));
      for (const d of HARD_COVERAGE_FIXTURE_RULES.filter((r) => r.kind === 'decoy')) {
        expect(d.technique).not.toBe(caseById.get(d.caseId)!.attackTechnique);
        // Decoy techniques may overlap case techniques of OTHER kinds (that is fine) but the
        // decoy must stay findable by its own technique, so the intel table must know it.
        expect(MITRE_TECHNIQUE_INTEL[d.technique]).toBeDefined();
      }
      expect([...caseTechniques].length).toBeGreaterThan(0);
    });
  });

  describe('buildHardRuleTechnique', () => {
    it('nests a dotted id under its parent with MITRE names and references', () => {
      expect(buildHardRuleTechnique('T1218.011')).toEqual({
        id: 'T1218',
        name: 'System Binary Proxy Execution',
        reference: 'https://attack.mitre.org/techniques/T1218/',
        subtechnique: [
          {
            id: 'T1218.011',
            name: 'Rundll32',
            reference: 'https://attack.mitre.org/techniques/T1218/011/',
          },
        ],
      });
    });

    it('keeps a parent id flat, without a subtechnique array', () => {
      expect(buildHardRuleTechnique('T1047')).toEqual({
        id: 'T1047',
        name: 'Windows Management Instrumentation',
        reference: 'https://attack.mitre.org/techniques/T1047/',
      });
    });

    it('splits AML-prefixed dotted ids the same way the find_rules regex routes them', () => {
      const technique = buildHardRuleTechnique('AML.T0051.000') as unknown as SeededTechnique;
      expect(technique.id).toBe('AML.T0051');
      expect(technique.subtechnique?.map((s) => s.id)).toEqual(['AML.T0051.000']);
    });
  });

  describe('buildHardRuleThreat', () => {
    it('uses the technique own first tactic, not a fixed one', () => {
      expect(buildHardRuleThreat('T1003.001')).toEqual({
        framework: 'MITRE ATT&CK',
        tactic: {
          id: 'TA0006',
          name: 'Credential Access',
          reference: 'https://attack.mitre.org/tactics/TA0006/',
        },
        technique: [buildHardRuleTechnique('T1003.001')],
      });
    });
  });
});
