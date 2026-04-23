/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { loadSkillsFromDisk, parseSkill } from './skill_loader';

describe('parseSkill', () => {
  it('accepts a valid skill JSON', () => {
    const s = parseSkill(
      {
        id: 'soc-foo',
        name: 'Foo',
        description: 'does foo',
        content: 'prompt',
        tool_ids: ['a', 'b'],
      },
      'inline'
    );
    expect(s.id).toBe('soc-foo');
    expect(s.tool_ids).toEqual(['a', 'b']);
  });

  it('throws when id is missing', () => {
    expect(() => parseSkill({ name: 'x', description: 'x', content: 'x' }, 'inline')).toThrow(
      /missing 'id'/
    );
  });

  it('tolerates a missing tool_ids array (defaults to [])', () => {
    const s = parseSkill({ id: 'x', name: 'x', description: 'x', content: 'x' }, 'inline');
    expect(s.tool_ids).toEqual([]);
  });

  it('filters non-string entries out of tool_ids', () => {
    const s = parseSkill(
      {
        id: 'x',
        name: 'x',
        description: 'x',
        content: 'x',
        tool_ids: ['a', 42, null, 'b'],
      },
      'inline'
    );
    expect(s.tool_ids).toEqual(['a', 'b']);
  });
});

describe('loadSkillsFromDisk', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'argus-skills-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('loads every .json file under the directory, sorted by id', async () => {
    await writeFile(
      join(dir, 'b.json'),
      JSON.stringify({ id: 'b-skill', name: 'B', description: 'B', content: 'p', tool_ids: [] })
    );
    await writeFile(
      join(dir, 'a.json'),
      JSON.stringify({ id: 'a-skill', name: 'A', description: 'A', content: 'p', tool_ids: [] })
    );
    const skills = await loadSkillsFromDisk(dir);
    expect(skills.map((s) => s.id)).toEqual(['a-skill', 'b-skill']);
  });

  it('rejects malformed JSON with a helpful error', async () => {
    await writeFile(join(dir, 'bad.json'), '{ not json');
    await expect(loadSkillsFromDisk(dir)).rejects.toThrow(/failed to parse/);
  });
});
