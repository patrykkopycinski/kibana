/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AgentRegistry } from '@kbn/agent-builder-server';
import type { KibanaRequest } from '@kbn/core/server';
import { loggerMock } from '@kbn/logging-mocks';
import { agentBuilderMocks } from '@kbn/agent-builder-plugin/server/mocks';
import {
  ensureAlertAnalysisAgent,
  ALERT_ANALYSIS_AGENT_ID,
  ALERT_ANALYSIS_SKILL_ID,
} from './ensure_alert_analysis_agent';

describe('ensureAlertAnalysisAgent (FR-012, FR-013)', () => {
  let registry: jest.Mocked<AgentRegistry>;
  const logger = loggerMock.create();

  beforeEach(async () => {
    jest.clearAllMocks();
    registry = (await agentBuilderMocks
      .createStart()
      .agents.getRegistry({ request: {} as KibanaRequest })) as jest.Mocked<AgentRegistry>;
  });

  it('creates the agent scoped to the alert-analysis skill when it does not exist', async () => {
    registry.has.mockResolvedValue(false);

    await ensureAlertAnalysisAgent({ registry, logger });

    expect(registry.has).toHaveBeenCalledWith(ALERT_ANALYSIS_AGENT_ID);
    expect(registry.create).toHaveBeenCalledTimes(1);

    const [createRequest] = registry.create.mock.calls[0];
    expect(createRequest.id).toBe(ALERT_ANALYSIS_AGENT_ID);
    expect(createRequest.configuration.skill_ids).toEqual([ALERT_ANALYSIS_SKILL_ID]);
  });

  it('does not create the agent when it already exists', async () => {
    registry.has.mockResolvedValue(true);

    await ensureAlertAnalysisAgent({ registry, logger });

    expect(registry.has).toHaveBeenCalledWith(ALERT_ANALYSIS_AGENT_ID);
    expect(registry.create).not.toHaveBeenCalled();
  });
});
