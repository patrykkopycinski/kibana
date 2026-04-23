/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type { BuiltinSkillBoundedTool } from '@kbn/agent-builder-server/skills/tools';
import type { ToolHandlerStandardReturn } from '@kbn/agent-builder-server/tools';
import { createToolHandlerContext, createToolTestMocks } from '../../__mocks__/test_helpers';
import { argusExplainDecisionSkill } from './argus_explain_decision_skill';

interface ResultData {
  message?: string;
  reasoningChain?: Record<string, unknown>;
  subject?: { kind: 'alert' | 'run'; id: string };
}

const getData = (result: ToolHandlerStandardReturn, idx = 0): ResultData =>
  result.results[idx].data as unknown as ResultData;

describe('argusExplainDecisionSkill', () => {
  describe('skill definition', () => {
    it('has correct metadata', () => {
      expect(argusExplainDecisionSkill.id).toBe('argus-explain-decision');
      expect(argusExplainDecisionSkill.name).toBe('argus-explain-decision');
      expect(argusExplainDecisionSkill.basePath).toBe('skills/security/argus');
      expect(argusExplainDecisionSkill.description).toContain('Argus');
      expect(argusExplainDecisionSkill.description).toContain('reasoning chain');
    });

    it('registers no registry tools', () => {
      expect(argusExplainDecisionSkill.getRegistryTools?.()).toEqual([]);
    });

    it('exposes one inline tool with the expected id', async () => {
      const inlineTools = await argusExplainDecisionSkill.getInlineTools?.();
      expect(inlineTools).toHaveLength(1);
      expect(inlineTools![0].id).toBe('security.argus.explain_decision');
    });
  });

  describe('security.argus.explain_decision handler', () => {
    const { mockEsClient, mockRequest, mockLogger } = createToolTestMocks();

    let tool: BuiltinSkillBoundedTool;

    beforeEach(async () => {
      jest.clearAllMocks();
      const inlineTools = await argusExplainDecisionSkill.getInlineTools?.();
      tool = inlineTools![0] as BuiltinSkillBoundedTool;
    });

    const callHandler = (params: { subject_kind: 'alert' | 'run'; subject_id: string }) =>
      tool.handler(
        params,
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger, { spaceId: 'default' })
      ) as Promise<ToolHandlerStandardReturn>;

    const mockAlertLookup = (runId?: string) => {
      mockEsClient.asCurrentUser.search.mockResponseOnce({
        hits: {
          hits: runId
            ? [
                {
                  _id: 'alert-1',
                  _index: '.alerts-security.alerts-default',
                  _source: {
                    kibana: { alert: { argus: { run_id: runId } } },
                  },
                },
              ]
            : [],
        },
      } as ReturnType<typeof mockEsClient.asCurrentUser.search> extends Promise<infer R> ? R : never);
    };

    const mockSpansLookup = (hits: Array<Record<string, unknown>> = []) => {
      mockEsClient.asCurrentUser.search.mockResponseOnce({
        hits: {
          hits: hits.map((src, idx) => ({
            _id: `span-${idx}`,
            _index: '.soc-reasoning-trace',
            _source: src,
          })),
        },
      } as ReturnType<typeof mockEsClient.asCurrentUser.search> extends Promise<infer R> ? R : never);
    };

    it('returns `no_trace` explanation when the alert has no associated run', async () => {
      mockAlertLookup(undefined);

      const result = await callHandler({ subject_kind: 'alert', subject_id: 'alert-1' });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].type).toBe(ToolResultType.other);
      expect(getData(result).message).toContain('No Argus reasoning trace found');
      expect(getData(result).subject).toEqual({ kind: 'alert', id: 'alert-1' });
    });

    it('returns `no_trace` when a run has no spans', async () => {
      mockSpansLookup([]);

      const result = await callHandler({ subject_kind: 'run', subject_id: 'run-xyz' });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].type).toBe(ToolResultType.other);
      expect(getData(result).message).toContain('No Argus reasoning trace found');
      expect(getData(result).subject).toEqual({ kind: 'run', id: 'run-xyz' });
    });

    it('returns the reasoning chain when spans are found for an alert', async () => {
      mockAlertLookup('run-xyz');
      mockSpansLookup([
        {
          run_id: 'run-xyz',
          step_index: 0,
          step_type: 'prompt',
          verdict: 'escalate',
          trust_tier: 'high',
        },
      ]);

      const result = await callHandler({ subject_kind: 'alert', subject_id: 'alert-1' });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].type).toBe(ToolResultType.other);
      expect(getData(result).message).toContain('Argus reasoning chain for alert:alert-1');
      expect(getData(result).reasoningChain).toBeDefined();
    });

    it('returns an error result when Elasticsearch throws on span lookup', async () => {
      // First call (alert lookup inside resolveRunIdForAlert) is caught by the helper
      // and returns undefined. We simulate the second-stage failure by having the alert
      // lookup succeed and the spans lookup reject.
      mockAlertLookup('run-err');
      mockEsClient.asCurrentUser.search.mockImplementationOnce(() => {
        throw new Error('boom');
      });

      const result = await callHandler({ subject_kind: 'alert', subject_id: 'alert-1' });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].type).toBe(ToolResultType.error);
      expect(getData(result).message).toContain('Failed to fetch Argus reasoning chain');
      expect(getData(result).message).toContain('boom');
    });
  });
});
