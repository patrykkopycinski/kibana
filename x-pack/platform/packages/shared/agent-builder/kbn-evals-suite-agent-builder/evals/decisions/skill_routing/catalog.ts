/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as fs from 'fs';
import * as path from 'path';

export type SkillDomain = 'security' | 'platform' | 'search' | 'observability';

export interface CatalogSkill {
  id: string;
  name: string;
  description: string;
  domain: SkillDomain;
  source: 'live' | 'static' | 'source';
  excludeFromElasticCapabilities?: boolean;
}

export interface Catalog {
  provenance: Record<string, string>;
  skills: CatalogSkill[];
}

/** `security`: the security benchmark rows against the security skills only. `full`: everything. */
export type RoutingView = 'security' | 'full';
export const ROUTING_VIEWS: readonly RoutingView[] = ['security', 'full'];

/** Benchmark names that no longer exist under that name. */
export const SKILL_ALIASES: Readonly<Record<string, string>> = {
  // renamed in #271463
  'skill-authoring': 'skill-management',
};

export const loadCatalog = (file = path.join(__dirname, 'skill_catalog.json')): Catalog => {
  const catalog = JSON.parse(fs.readFileSync(file, 'utf-8')) as Catalog;
  const seen = new Set<string>();
  for (const skill of catalog.skills) {
    if (seen.has(skill.id)) throw new Error(`duplicate catalog id [${skill.id}]`);
    if (!skill.description.trim()) throw new Error(`[${skill.id}] has no description`);
    seen.add(skill.id);
  }
  return catalog;
};

export const viewSkills = (catalog: Catalog, view: RoutingView): CatalogSkill[] =>
  view === 'full' ? catalog.skills : catalog.skills.filter(({ domain }) => domain === view);

export type Resolution =
  | { kind: 'exact'; id: string }
  | { kind: 'canonicalised'; id: string; via: 'alias' | 'name' | 'suffix' }
  | { kind: 'unresolved'; candidates: string[] };

/**
 * Maps a skill name as written anywhere (benchmark CSV, model output) to one catalog id.
 * Names come as the id, the display name, the unprefixed id (`keyword-search` for
 * `search.keyword-search`), or a retired name.
 */
export const createSkillResolver = (skills: readonly CatalogSkill[]) => {
  const ids = new Set(skills.map(({ id }) => id));
  return (raw: string): Resolution => {
    const name = raw.trim();
    if (ids.has(name)) return { kind: 'exact', id: name };
    const aliased = SKILL_ALIASES[name];
    if (aliased && ids.has(aliased)) return { kind: 'canonicalised', id: aliased, via: 'alias' };
    const byName = skills.filter((skill) => skill.name === name).map(({ id }) => id);
    if (byName.length === 1) return { kind: 'canonicalised', id: byName[0], via: 'name' };
    const bySuffix = skills.filter(({ id }) => id.endsWith(`.${name}`)).map(({ id }) => id);
    if (byName.length === 0 && bySuffix.length === 1) {
      return { kind: 'canonicalised', id: bySuffix[0], via: 'suffix' };
    }
    return { kind: 'unresolved', candidates: [...byName, ...bySuffix] };
  };
};

export type SkillResolver = ReturnType<typeof createSkillResolver>;
