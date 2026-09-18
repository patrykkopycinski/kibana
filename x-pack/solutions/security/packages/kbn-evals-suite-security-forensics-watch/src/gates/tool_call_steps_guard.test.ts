/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable import/no-nodejs-modules -- this guard reads the package's own spec sources */
import fs from 'fs';
import path from 'path';
import { countToolCallStepsCalls, findToolCallStepsMisuse } from './tool_call_steps_guard';

const EVALS_DIR = path.resolve(__dirname, '..', '..', 'evals');

const specFiles = (): string[] =>
  fs
    .readdirSync(EVALS_DIR)
    .filter((name) => name.endsWith('.spec.ts'))
    .sort();

describe('getToolCallSteps call-site guard', () => {
  it('flags the extracted-array misuse that empties every tool-call gate', () => {
    const source = [
      'const result = await agentBuilderClient.converse({ agentId, input });',
      'const steps = getToolCallSteps(result.steps);',
    ].join('\n');

    expect(findToolCallStepsMisuse(source)).toEqual([
      { line: 2, snippet: 'getToolCallSteps(result.steps)' },
    ]);
  });

  it('flags any property path ending in .steps, not just the literal result.steps', () => {
    const source = [
      'const steps = getToolCallSteps(response.steps);',
      'const other = getToolCallSteps(taskOutput.steps);',
      "const nested = getToolCallSteps(state['result'].steps);",
    ].join('\n');

    expect(findToolCallStepsMisuse(source)).toHaveLength(3);
  });

  it('accepts passing the whole task output', () => {
    const source = [
      'const steps = getToolCallSteps(result);',
      'const more = getToolCallSteps(response);',
    ].join('\n');

    expect(findToolCallStepsMisuse(source)).toEqual([]);
    expect(countToolCallStepsCalls(source)).toBe(2);
  });

  it('finds no misuse across every evals/*.spec.ts in this package', () => {
    const files = specFiles();
    expect(files).toContain('gate_family_a.spec.ts');
    expect(files).toContain('orchestrator_identity.spec.ts');

    const scanned = files.map((name) => ({
      name,
      source: fs.readFileSync(path.join(EVALS_DIR, name), 'utf8'),
    }));

    // Guards against a false green from reading nothing: the package must still
    // be exercising getToolCallSteps somewhere for this scan to mean anything.
    const totalCallSites = scanned.reduce(
      (total, file) => total + countToolCallStepsCalls(file.source),
      0
    );
    expect(totalCallSites).toBeGreaterThan(0);

    const misuses = scanned.flatMap((file) =>
      findToolCallStepsMisuse(file.source).map((misuse) => `${file.name}:${misuse.line}`)
    );
    expect(misuses).toEqual([]);
  });
});
