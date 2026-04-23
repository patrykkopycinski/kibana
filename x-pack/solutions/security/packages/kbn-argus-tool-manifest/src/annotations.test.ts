/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { computeToolAnnotations } from './annotations';

describe('computeToolAnnotations', () => {
  it('classifies a pure-read skill as read-only + idempotent', () => {
    const a = computeToolAnnotations('soc-proactive-hunt', [
      'platform.core.execute_esql',
      'platform.core.search',
      'security.alerts',
    ]);
    expect(a.readOnlyHint).toBe(true);
    expect(a.destructiveHint).toBe(false);
    expect(a.idempotentHint).toBe(true);
    expect(a.openWorldHint).toBe(false);
  });

  it('flips readOnlyHint off when a writer tool is present', () => {
    const a = computeToolAnnotations('soc-rule-tuner', [
      'platform.core.search',
      'security.rule_update',
    ]);
    expect(a.readOnlyHint).toBe(false);
    expect(a.destructiveHint).toBe(false);
    expect(a.idempotentHint).toBe(false);
  });

  it('marks destructive ops on rule_delete', () => {
    const a = computeToolAnnotations('soc-rule-retirement', [
      'platform.core.search',
      'security.rule_delete',
    ]);
    expect(a.destructiveHint).toBe(true);
    expect(a.readOnlyHint).toBe(false);
  });

  it('marks openWorldHint when skill pulls external threat intel', () => {
    const a = computeToolAnnotations('soc-intel-sweep', [
      'platform.core.search',
      'security.security_labs_search',
    ]);
    expect(a.openWorldHint).toBe(true);
    expect(a.readOnlyHint).toBe(true);
  });

  it('idempotentHint stays true for known pure-read classifiers even if tool list is empty', () => {
    const a = computeToolAnnotations('soc-architecture-review', []);
    expect(a.idempotentHint).toBe(true);
  });
});
