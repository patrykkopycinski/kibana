/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DetectionRuleExampleInput, DetectionRuleTaskOutput } from './evaluate_dataset';

/**
 * Seam through which the Argus detection suite invokes a Security Solution
 * detection rule against a corpus event. Kept intentionally narrow so Day-2 can
 * swap the no-op implementation for a Scout-fixture-backed rule runner call
 * without touching the evaluators or the spec file.
 */
export interface ReplayClient {
  replay(input: DetectionRuleExampleInput): Promise<DetectionRuleTaskOutput>;
}

/**
 * Day-1 skeleton — always throws. The presence of this stub is what lets the
 * suite compile end-to-end; the failure at runtime is the deliberate signal
 * that the replay seam is unwired.
 */
export function createNoopReplayClient(): ReplayClient {
  return {
    async replay({ rule_id: ruleId, primitive_id: primitiveId }): Promise<DetectionRuleTaskOutput> {
      throw new Error(
        `NotImplemented: ReplayClient.replay(ruleId=${ruleId}, primitive=${primitiveId}) — M2.1 day-1 skeleton`
      );
    },
  };
}
