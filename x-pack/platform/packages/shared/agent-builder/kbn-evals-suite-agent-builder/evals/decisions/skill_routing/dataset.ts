/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BenchmarkExample } from '../../skill_selection/benchmark_dataset';
import { ALL_EXAMPLES } from '../../skill_selection/benchmark_dataset';
import type { Catalog, CatalogSkill, RoutingView, SkillResolver } from './catalog';
import { createSkillResolver, viewSkills } from './catalog';

/**
 * The skill-selection benchmark (benchmark_dataset.csv) re-read as routing cases, with every
 * expected skill canonicalised to one catalog id. Queries are synthetic.
 */
export interface RoutingCase {
  id: string;
  query: string;
  category: string;
  queryType: BenchmarkExample['metadata']['queryType'];
  /** Benchmark grouping key, never a routing target. */
  skillId: string;
  /** Catalog id of the skill that should be selected; null when no skill should load. */
  expected: string | null;
  /** The CSV notes flag the row as AMBIGUOUS; reported separately from the headline. */
  ambiguous: boolean;
}

export interface ResolutionReport {
  rows: number;
  exact: number;
  canonicalised: Array<{ from: string; to: string; via: string }>;
  unresolved: Array<{ name: string; candidates: string[] }>;
  noSkillRows: number;
}

export const caseId = (index: number) => `R${String(index + 1).padStart(3, '0')}`;

export const loadRoutingCases = (
  catalog: Catalog,
  examples: readonly BenchmarkExample[] = ALL_EXAMPLES
): { cases: RoutingCase[]; resolution: ResolutionReport } => {
  const resolve = createSkillResolver(catalog.skills);
  const resolution: ResolutionReport = {
    rows: examples.length,
    exact: 0,
    canonicalised: [],
    unresolved: [],
    noSkillRows: 0,
  };
  const cases = examples.map(({ input, output, metadata }, index): RoutingCase => {
    let expected: string | null = null;
    if (output.expectedSkill) {
      const resolved = resolve(output.expectedSkill);
      if (resolved.kind === 'unresolved') {
        resolution.unresolved.push({
          name: output.expectedSkill,
          candidates: resolved.candidates,
        });
      } else {
        expected = resolved.id;
        if (resolved.kind === 'exact') resolution.exact++;
        else
          resolution.canonicalised.push({
            from: output.expectedSkill,
            to: resolved.id,
            via: resolved.via,
          });
      }
    } else {
      resolution.noSkillRows++;
    }
    return {
      id: caseId(index),
      query: input.question,
      category: metadata.category,
      queryType: metadata.queryType,
      skillId: metadata.skillId,
      expected,
      ambiguous: /\bAMBIGUOUS\b/.test(metadata.notes ?? ''),
    };
  });
  if (resolution.unresolved.length > 0) {
    throw new Error(
      `unresolved expected skills: ${resolution.unresolved.map(({ name }) => name).join(', ')}`
    );
  }
  return { cases, resolution };
};

/**
 * `security`: the security rows routed over the security skills only (the matrix setting).
 * `full`: every row routed over the whole catalog (the default agent).
 */
export const viewCases = (
  cases: readonly RoutingCase[],
  catalog: Catalog,
  view: RoutingView
): { cases: RoutingCase[]; skills: CatalogSkill[]; resolver: SkillResolver } => {
  const skills = viewSkills(catalog, view);
  const ids = new Set(skills.map(({ id }) => id));
  const selected = view === 'full' ? [...cases] : cases.filter((c) => c.category === view);
  const outside = selected.filter(({ expected }) => expected !== null && !ids.has(expected));
  if (outside.length > 0) {
    throw new Error(
      `[${view}] ${outside.length} cases expect a skill outside the view: ${outside
        .map(({ id, expected }) => `${id}->${expected}`)
        .join(', ')}`
    );
  }
  return { cases: selected, skills, resolver: createSkillResolver(skills) };
};
