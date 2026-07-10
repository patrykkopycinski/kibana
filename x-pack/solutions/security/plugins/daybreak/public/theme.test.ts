/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import fs from 'fs';
import path from 'path';
import { daybreakTheme } from './theme';

const TOKEN_GROUPS = ['neutrals', 'semantic', 'threadType', 'shape'] as const;

describe('theme.mapping.md (FR-007)', () => {
  const mappingPath = path.join(__dirname, 'theme.mapping.md');

  it('exists beside theme.ts', () => {
    expect(fs.existsSync(mappingPath)).toBe(true);
  });

  it('documents every token group with a EUI-token mapping table', () => {
    const contents = fs.readFileSync(mappingPath, 'utf-8');

    for (const group of TOKEN_GROUPS) {
      expect(contents).toContain(group);
    }
    // Every token key surfaced by daybreakTheme.modes.dark must be traceable
    // to an EUI token reference (`eui`-prefixed) in the mapping table.
    for (const group of TOKEN_GROUPS) {
      for (const tokenKey of Object.keys(daybreakTheme.modes.dark[group])) {
        expect(contents).toContain(tokenKey);
      }
    }
    expect(contents).toMatch(/eui[A-Z]\w*/);
  });
});

describe('daybreakTheme (FR-004, FR-005)', () => {
  it('defaults to the prototype dark build', () => {
    expect(daybreakTheme.defaultMode).toBe('dark');
  });

  it.each(['light', 'dark'] as const)('modes.%s exposes all four token groups', (mode) => {
    const tokens = daybreakTheme.modes[mode];

    for (const group of TOKEN_GROUPS) {
      expect(tokens).toHaveProperty(group);
      expect(tokens[group]).toBeDefined();
      expect(typeof tokens[group]).toBe('object');
      expect(Object.keys(tokens[group]).length).toBeGreaterThan(0);
    }
  });

  it('modes.light and modes.dark define distinct neutral background values', () => {
    expect(daybreakTheme.modes.light.neutrals.backgroundPlain).not.toBe(
      daybreakTheme.modes.dark.neutrals.backgroundPlain
    );
  });
});
