/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  assignSplits,
  loadShouldRespondExamples,
  loadShouldRespondItems,
  toDecisionState,
} from './dataset';

describe('should_respond dataset', () => {
  const items = loadShouldRespondItems();
  const getItem = (id: string) => {
    const item = items.find((candidate) => candidate.id === id);
    if (!item) throw new Error(`missing dataset item [${id}]`);
    return item;
  };

  it('has both classes and unique ids', () => {
    expect(items.length).toBeGreaterThanOrEqual(150);
    expect(items.some(({ label }) => label)).toBe(true);
    expect(items.some(({ label }) => !label)).toBe(true);
  });

  it('splits deterministically', () => {
    expect([...assignSplits(items)]).toEqual([...assignSplits([...items].reverse())]);
  });

  it('puts both labels of every category with 2+ items into both splits', () => {
    const splits = assignSplits(items);
    const strata = new Map<string, Set<string>>();
    for (const item of items) {
      const key = `${item.category}|${item.label}`;
      strata.set(key, (strata.get(key) ?? new Set()).add(splits.get(item.id) ?? ''));
    }
    for (const [key, seen] of strata) {
      const size = items.filter((item) => `${item.category}|${item.label}` === key).length;
      if (size >= 3) expect([key, [...seen].sort()]).toEqual([key, ['test', 'train']]);
    }
  });

  it('holds out roughly 40% for test', () => {
    const examples = loadShouldRespondExamples();
    const testShare =
      examples.filter(({ metadata }) => metadata.split === 'test').length / examples.length;
    expect(testShare).toBeGreaterThan(0.33);
    expect(testShare).toBeLessThan(0.47);
  });

  it('renders agent replies under the agent name, through the production input builder', () => {
    const state = toDecisionState(getItem('pos-followup-01'));
    expect(state).toContain('Agent: Observability Assistant - ');
    expect(state).toContain('[Observability Assistant]: Checkout error rate is 2.4%');
    expect(state).toContain('New message from Alice Chen:');
  });

  it('renders attachment-only turns', () => {
    expect(toDecisionState(getItem('bord-attach-01'))).toContain('(attachments only)');
  });
});
