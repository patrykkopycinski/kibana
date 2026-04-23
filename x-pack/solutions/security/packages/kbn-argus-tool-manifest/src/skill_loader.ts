/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

import type { ArgusSkillDescriptor } from './types';

/**
 * Shape of the JSON on disk. The loader validates the fields it needs and
 * passes anything extra through — future additions to the skill schema do
 * not force a loader change.
 */
interface RawSkillJson {
  readonly id: unknown;
  readonly name: unknown;
  readonly description: unknown;
  readonly content: unknown;
  readonly tool_ids: unknown;
}

const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

const parseToolIds = (raw: unknown): readonly string[] => {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isString);
};

export const parseSkill = (raw: unknown, source: string): ArgusSkillDescriptor => {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`argus-tool-manifest: skill at ${source} is not an object`);
  }
  const s = raw as RawSkillJson;
  if (!isString(s.id)) throw new Error(`argus-tool-manifest: skill at ${source} missing 'id'`);
  if (!isString(s.name)) throw new Error(`argus-tool-manifest: skill at ${source} missing 'name'`);
  if (!isString(s.description)) {
    throw new Error(`argus-tool-manifest: skill at ${source} missing 'description'`);
  }
  if (!isString(s.content)) {
    throw new Error(`argus-tool-manifest: skill at ${source} missing 'content'`);
  }

  return {
    id: s.id,
    name: s.name,
    description: s.description,
    content: s.content,
    tool_ids: parseToolIds(s.tool_ids),
  };
};

/**
 * Load every `*.json` under the given directory and parse it as an Argus
 * skill. Results are returned in sorted-by-id order so the projected
 * manifest is stable across processes.
 */
export const loadSkillsFromDisk = async (dir: string): Promise<readonly ArgusSkillDescriptor[]> => {
  const entries = await readdir(dir);
  const files = entries.filter((name) => name.endsWith('.json')).sort();
  const skills: ArgusSkillDescriptor[] = [];
  for (const file of files) {
    const full = join(dir, file);
    const text = await readFile(full, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`argus-tool-manifest: failed to parse ${full}: ${message}`);
    }
    skills.push(parseSkill(parsed, full));
  }
  return skills;
};
