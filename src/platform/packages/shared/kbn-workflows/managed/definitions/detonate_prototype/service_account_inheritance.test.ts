/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0".
 */

import { parse } from 'yaml';

import {
  DETONATE_COVERAGE_GAP_WORKFLOW,
  DETONATE_IOC_HUNT_WORKFLOW,
  DETONATE_IOC_RULE_WORKFLOW,
  DETONATE_RULE_CREATION_WORKFLOW,
} from '.';
import { WorkflowExecuteStepInputSchema } from '../../../spec/schema';

interface YamlStep {
  name: string;
  type: string;
  with?: Record<string, unknown>;
  steps?: YamlStep[];
  else?: YamlStep[];
  default?: YamlStep[];
  cases?: Array<{ steps: YamlStep[] }>;
  'on-failure'?: { fallback?: YamlStep[] };
}

const flatten = (steps: YamlStep[] = []): YamlStep[] =>
  steps.flatMap((step) => [
    step,
    ...flatten(step.steps),
    ...flatten(step.else),
    ...flatten(step.default),
    ...(step.cases ?? []).flatMap(({ steps: caseSteps }) => flatten(caseSteps)),
    ...flatten(step['on-failure']?.fallback),
  ]);

// The service-account surface of the detonate prototype: every Worker entry
// chain that starts children. The triage relay and fp-validation carry their
// own identity semantics (the relay runs as the caller, fp-validation is a
// manual round trip), so they are covered by their own pin tests instead.
const CHAIN_DEFINITIONS = [
  DETONATE_COVERAGE_GAP_WORKFLOW,
  DETONATE_IOC_HUNT_WORKFLOW,
  DETONATE_IOC_RULE_WORKFLOW,
  DETONATE_RULE_CREATION_WORKFLOW,
] as const;

const childCalls = CHAIN_DEFINITIONS.flatMap((definition) =>
  flatten((parse(definition.yaml) as { steps: YamlStep[] }).steps)
    .filter(({ type }) => type === 'workflow.execute' || type === 'workflow.executeAsync')
    .map((step) => ({ owner: definition.id, step }))
);

// A detonation chain runs as a service account: a sweep dispatched by a
// Worker's tick, a copy started by a sweep. Every child in the chain must
// name the child and inherit, or it silently runs as the original caller.
describe('Detonate service account inheritance', () => {
  // The dispatching chains and the leaf: the coverage sweep, the
  // rule-creation copy and the IOC rule worker start children, while the ioc-hunt sweep is a leaf
  // (its only write back is a handoff marker), so it must stay one.
  const owners = () => new Set(childCalls.map(({ owner }) => owner));

  it('covers the dispatching chains and keeps the ioc-hunt sweep a leaf', () => {
    expect(childCalls.length).toBeGreaterThan(0);
    expect(owners()).toContain(DETONATE_COVERAGE_GAP_WORKFLOW.id);
    expect(owners()).toContain(DETONATE_RULE_CREATION_WORKFLOW.id);
    expect(owners()).toContain(DETONATE_IOC_RULE_WORKFLOW.id);
    expect(owners()).not.toContain(DETONATE_IOC_HUNT_WORKFLOW.id);
  });

  it.each(childCalls.map(({ owner, step }) => [owner, step.name, step] as const))(
    '%s step %s uses only known workflow.execute inputs',
    (_owner, _name, step) => {
      const result = WorkflowExecuteStepInputSchema.strict().safeParse(step.with);

      expect(result.success ? null : result.error.issues).toBeNull();
    }
  );

  it.each(childCalls.map(({ owner, step }) => [owner, step.name, step] as const))(
    '%s step %s inherits the parent service account by literal id',
    (_owner, _name, step) => {
      expect(step.with?.['run-as-mode']).toBe('inherit');
      expect(String(step.with?.['workflow-id'])).not.toContain('{{');
    }
  );
});
