/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0, the GNU Affero General Public License v3.0 only, or the Server Side
 * Public License v1 as approved by ....... Use, modification, and distribution
 * are permitted under the Elastic License 2.0.
 */

import {
  changeTypeAccuracy,
  validProposal,
} from './evaluators';
import type { RuleTuningProposal } from './workflow_task';
import type { ChangeType } from './constants';

describe('rule-tuning evaluators', () => {
  describe('changeTypeAccuracy', () => {
    it('scores 1 when the predicted change_type matches the golden label', async () => {
      const output: RuleTuningProposal = {
        change_type: 'exception',
        executionId: 'exec-1',
        executionStatus: 'completed' as never,
      };
      const result = await changeTypeAccuracy.evaluate!({ output, expected: { change_type: 'exception' } } as never);
      expect(result.score).toBe(1);
    });

    it('scores 0 when the predicted change_type differs from the golden label', async () => {
      const output: RuleTuningProposal = {
        change_type: 'manual',
        executionId: 'exec-2',
        executionStatus: 'completed' as never,
      };
      const result = await changeTypeAccuracy.evaluate!({ output, expected: { change_type: 'exception' } } as never);
      expect(result.score).toBe(0);
      expect(result.explanation).toContain('expected="exception"');
    });

    it('scores 0 when the workflow failed and no proposal exists', async () => {
      const output: RuleTuningProposal = {
        executionId: 'exec-3',
        executionStatus: 'failed' as never,
      };
      const result = await changeTypeAccuracy.evaluate!({ output, expected: { change_type: 'query' } } as never);
      expect(result.score).toBe(0);
      expect(result.label).toBe('none');
    });
  });

  describe('validProposal', () => {
    const base: RuleTuningProposal = {
      change_type: 'exception',
      exception_entries: [{ field: 'host.name', operator: 'is', value: 'web-01' }],
      executionId: 'exec-4',
      executionStatus: 'completed' as never,
    };

    it('accepts a well-formed exception proposal', async () => {
      const result = await validProposal.evaluate!({ output: base } as never);
      expect(result.score).toBe(1);
    });

    it('rejects an exception proposal with zero entries (minItems gate)', async () => {
      const result = await validProposal.evaluate!({
        output: { ...base, exception_entries: [] },
      } as never);
      expect(result.score).toBe(0);
    });

    it('rejects a change_type outside the enum', async () => {
      const result = await validProposal.evaluate!({
        output: { ...base, change_type: 'delete_rule' as ChangeType },
      } as never);
      expect(result.score).toBe(0);
      expect((result.metadata as { changeTypeValid: boolean }).changeTypeValid).toBe(false);
    });

    it('rejects a query proposal with an empty proposed_query', async () => {
      const result = await validProposal.evaluate!({
        output: { ...base, change_type: 'query', proposed_query: '' },
      } as never);
      expect(result.score).toBe(0);
    });

    it('rejects a risk_score proposal missing proposed_severity (PATCH would fail)', async () => {
      const result = await validProposal.evaluate!({
        output: { ...base, change_type: 'risk_score', proposed_risk_score: 20 },
      } as never);
      expect(result.score).toBe(0);
    });

    it('accepts a risk_score proposal with both score and severity', async () => {
      const result = await validProposal.evaluate!({
        output: { ...base, change_type: 'risk_score', proposed_risk_score: 20, proposed_severity: 'low' },
      } as never);
      expect(result.score).toBe(1);
    });

    it('rejects suppression on a rule type whose PATCH has no alert_suppression field', async () => {
      const result = await validProposal.evaluate!({
        output: { ...base, change_type: 'suppression', suppression_group_by: ['host.name'] },
        metadata: { ruleType: 'machine_learning' },
      } as never);
      expect(result.score).toBe(0);
    });

    it('accepts suppression on a suppression-capable rule type', async () => {
      const result = await validProposal.evaluate!({
        output: { ...base, change_type: 'suppression', suppression_group_by: ['host.name'] },
        metadata: { ruleType: 'query' },
      } as never);
      expect(result.score).toBe(1);
    });
  });
});
