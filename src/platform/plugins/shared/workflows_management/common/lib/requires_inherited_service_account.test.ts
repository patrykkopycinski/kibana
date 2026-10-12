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
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1.0"; you may not use this file except in compliance with the
 * Elastic License 2.0 OR (at your option) any later version.
 */

import { requiresInheritedServiceAccount } from './requires_inherited_service_account';

const inheritStep = (type: 'workflow.execute' | 'workflow.executeAsync' = 'workflow.execute') => ({
  name: 'call_child',
  type,
  with: { 'workflow-id': 'child', 'run-as-mode': 'inherit' },
});

describe('requiresInheritedServiceAccount', () => {
  it('is false for unmanaged workflows even with inherit steps', () => {
    expect(
      requiresInheritedServiceAccount({
        managed: false,
        definition: { steps: [inheritStep()] } as any,
      })
    ).toBe(false);
  });

  it('is false for a managed workflow with its own run_as', () => {
    expect(
      requiresInheritedServiceAccount({
        managed: true,
        definition: { settings: { run_as: 'account-1' }, steps: [inheritStep()] } as any,
      })
    ).toBe(false);
  });

  it('is true for a managed workflow with a top-level inherit step and no run_as', () => {
    expect(
      requiresInheritedServiceAccount({
        managed: true,
        definition: { steps: [inheritStep()] } as any,
      })
    ).toBe(true);
  });

  it('is true for an inherit step nested inside a container step', () => {
    const definition = {
      steps: [
        {
          name: 'branch',
          type: 'if',
          condition: '{{ true }}',
          steps: [inheritStep('workflow.executeAsync')],
        },
      ],
    } as any;
    expect(requiresInheritedServiceAccount({ managed: true, definition })).toBe(true);
  });

  it('is false for a managed workflow whose execute steps use the default mode', () => {
    const definition = {
      steps: [{ name: 'call_child', type: 'workflow.execute', with: { 'workflow-id': 'child' } }],
    } as any;
    expect(requiresInheritedServiceAccount({ managed: true, definition })).toBe(false);
  });

  it('is false when there is no definition', () => {
    expect(requiresInheritedServiceAccount({ managed: true, definition: null })).toBe(false);
  });

  it('matches the shipped Attack Discovery runner definition', () => {
    // The global runner has no run_as and dispatches generation with inherit.
    const runner = {
      managed: true,
      definition: {
        settings: {
          concurrency: {
            key: 'attack-discovery-worker-{{ workflow.spaceId }}',
            strategy: 'cancel-in-progress',
            max: 1,
          },
        },
        steps: [
          {
            name: 'run_generation',
            type: 'workflow.execute',
            with: {
              'workflow-id': 'system-security-attack-discovery-batched-generation',
              'run-as-mode': 'inherit',
            },
          },
        ],
      },
    } as any;
    expect(requiresInheritedServiceAccount(runner)).toBe(true);
  });
});
