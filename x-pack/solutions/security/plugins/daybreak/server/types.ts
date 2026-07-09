/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import type { WorkflowsExecutionEnginePluginStart } from '@kbn/workflows-execution-engine/server';
import type { AgentBuilderPluginStart } from '@kbn/agent-builder-server';

// ---------------------------------------------------------------------------
// Plugin lifecycle contracts
// ---------------------------------------------------------------------------

/** Setup contract exposed to other plugins by the Daybreak plugin. */
export type DaybreakPluginSetup = Record<string, never>;

/** Optional plugin dependencies consumed during start. */
export interface DaybreakPluginStartDeps {
  workflowsExecutionEngine?: WorkflowsExecutionEnginePluginStart;
  agentBuilder?: AgentBuilderPluginStart;
}

/** Function returned by {@link DaybreakPluginStart.runSpikeWorkflow}. */
export type RunSpikeWorkflow = (request: KibanaRequest) => Promise<void>;

/** Start contract exposed to other plugins by the Daybreak plugin. */
export interface DaybreakPluginStart {
  /**
   * Trigger the PD-1 spike workflow once end-to-end through the existing
   * engine entry point (FR-008, FR-009, FR-010).
   *
   * Resolves when the engine has accepted the execution. Returns `void` —
   * callers should consult the logger for step-level output (FR-009).
   */
  runSpikeWorkflow?: RunSpikeWorkflow;
}
