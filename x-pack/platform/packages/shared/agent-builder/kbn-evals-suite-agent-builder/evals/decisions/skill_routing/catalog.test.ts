/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { CatalogSkill } from './catalog';
import { createSkillResolver, loadCatalog, viewSkills } from './catalog';
import { loadRoutingCases, viewCases } from './dataset';

const skill = (id: string, name = id, domain: CatalogSkill['domain'] = 'security') => ({
  id,
  name,
  description: `${id} description`,
  domain,
  source: 'static' as const,
});

describe('skill catalog', () => {
  it('loads the committed fixture with unique ids and every domain', () => {
    const catalog = loadCatalog();
    expect(catalog.skills).toHaveLength(68);
    expect(new Set(catalog.skills.map(({ domain }) => domain))).toEqual(
      new Set(['security', 'platform', 'search', 'observability'])
    );
    expect(viewSkills(catalog, 'security')).toHaveLength(30);
  });

  it('rejects duplicate ids', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-'));
    const file = path.join(dir, 'c.json');
    fs.writeFileSync(file, JSON.stringify({ provenance: {}, skills: [skill('a'), skill('a')] }));
    expect(() => loadCatalog(file)).toThrow(/duplicate/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('resolves exact ids, aliases, display names and unprefixed ids', () => {
    const resolve = createSkillResolver([
      skill('skill-management'),
      skill('automatic_troubleshooting', 'elastic-defend-configuration-troubleshooting'),
      skill('search.keyword-search', 'keyword-search', 'search'),
    ]);
    expect(resolve('skill-management')).toEqual({ kind: 'exact', id: 'skill-management' });
    expect(resolve('skill-authoring')).toMatchObject({ kind: 'canonicalised', via: 'alias' });
    expect(resolve('elastic-defend-configuration-troubleshooting')).toMatchObject({
      id: 'automatic_troubleshooting',
      via: 'name',
    });
    expect(resolve(' search.keyword-search ')).toMatchObject({ kind: 'exact' });
    expect(resolve('nope')).toEqual({ kind: 'unresolved', candidates: [] });
  });

  it('leaves a suffix that matches two skills unresolved', () => {
    const resolve = createSkillResolver([skill('a.x'), skill('b.x')]);
    expect(resolve('x')).toEqual({ kind: 'unresolved', candidates: ['a.x', 'b.x'] });
  });
});

describe('routing dataset', () => {
  const catalog = loadCatalog();

  it('canonicalises every benchmark skill and leaves none unresolved', () => {
    const { cases, resolution } = loadRoutingCases(catalog);
    expect(cases).toHaveLength(169);
    expect(resolution.unresolved).toEqual([]);
    expect(resolution.exact + resolution.canonicalised.length + resolution.noSkillRows).toBe(169);
    expect(resolution.noSkillRows).toBe(1);
    expect(cases.filter(({ ambiguous }) => ambiguous)).toHaveLength(15);
  });

  it('builds the security view from the security rows only', () => {
    const { cases } = loadRoutingCases(catalog);
    const view = viewCases(cases, catalog, 'security');
    expect(view.cases).toHaveLength(51);
    expect(view.skills).toHaveLength(30);
  });

  it('throws when a case expects a skill outside the view', () => {
    const { cases } = loadRoutingCases(catalog);
    const leaked = cases.map((c, index) =>
      index === 0 ? { ...c, category: 'security', expected: 'search.keyword-search' } : c
    );
    expect(() => viewCases(leaked, catalog, 'security')).toThrow(/outside the view/);
  });
});
