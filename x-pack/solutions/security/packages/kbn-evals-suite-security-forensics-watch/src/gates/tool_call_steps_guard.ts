/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Regression guard for a defect class that silently disarms behavioral gates:
 * `getToolCallSteps` takes the whole task output and reads its own `.steps`
 * property, so calling it on an already-extracted `*.steps` array always
 * returns an empty list and the gate observes no tool calls at all.
 */

export interface ToolCallStepsMisuse {
  line: number;
  snippet: string;
}

const MISUSE_PATTERN = /getToolCallSteps\s*\(\s*[A-Za-z0-9_$.[\]'"]*\.steps\b[^)]*\)/g;

/**
 * Scans source text for `getToolCallSteps(<something>.steps)` calls.
 */
export const findToolCallStepsMisuse = (source: string): ToolCallStepsMisuse[] => {
  const misuses: ToolCallStepsMisuse[] = [];

  source.split('\n').forEach((lineText, index) => {
    const matches = lineText.match(MISUSE_PATTERN);
    if (!matches) return;
    matches.forEach((snippet) => misuses.push({ line: index + 1, snippet: snippet.trim() }));
  });

  return misuses;
};

export const countToolCallStepsCalls = (source: string): number =>
  (source.match(/getToolCallSteps\s*\(/g) ?? []).length;
