/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parse } from "yaml";
import type { KibanaRequest, Logger } from "@kbn/core/server";
import type { WorkflowsExecutionEnginePluginStart } from "@kbn/workflows-execution-engine/server";
import { WorkflowSchema, toWorkflowExecutionEngineModel } from "@kbn/workflows";

import RESPONSE_ACTION_WORKER_YAML from "./response_action_worker.yaml";
import { collectStepLogs } from "./run_spike_workflow";

/** Stable ID for the proposal response-action worker workflow definition. */
const RESPONSE_ACTION_WORKER_ID = "daybreak-response-action-worker";

/** The engine entry-point type, derived from the published start contract. */
type ExecuteWorkflowFn = WorkflowsExecutionEnginePluginStart["executeWorkflow"];

/** Return type of {@link ExecuteWorkflowFn} — the execution response. */
type ExecuteWorkflowResult = Awaited<ReturnType<ExecuteWorkflowFn>>;

export type ResponseActionType = "get_processes" | "isolate";

export interface RunResponseActionWorkerParams {
  executeWorkflow: ExecuteWorkflowFn;
  logger: Logger;
  request: KibanaRequest;
  enabled?: boolean;
  proposalId: string;
  action?: ResponseActionType;
  hostName?: string;
}

/**
 * Parse and validate the proposal response-action worker workflow YAML against
 * the engine schema.
 */
export const getResponseActionWorkerWorkflow = () => {
  const parsed = parse(RESPONSE_ACTION_WORKER_YAML);
  return WorkflowSchema.parse(parsed);
};

/**
 * Trigger the proposal response-action worker workflow once end-to-end through
 * the existing engine entry point `executeWorkflow`.
 */
export const runResponseActionWorker = async ({
  executeWorkflow,
  logger,
  request,
  enabled,
  proposalId,
  action = "get_processes",
  hostName,
}: RunResponseActionWorkerParams): Promise<ExecuteWorkflowResult> => {
  const workflow = getResponseActionWorkerWorkflow();

  const stepLogs = collectStepLogs(workflow.steps);
  for (const entry of stepLogs) {
    logger.info(
      `daybreak response-action worker step input — [${entry.name}] type=${
        entry.type
      } input=${JSON.stringify(entry.input)}`
    );
  }

  const executableWorkflow = enabled === undefined ? workflow : { ...workflow, enabled };
  const executableYaml =
    enabled === undefined
      ? RESPONSE_ACTION_WORKER_YAML
      : RESPONSE_ACTION_WORKER_YAML.replace("enabled: false", "enabled: true");

  const model = toWorkflowExecutionEngineModel(
    {
      id: RESPONSE_ACTION_WORKER_ID,
      name: executableWorkflow.name,
      enabled: executableWorkflow.enabled,
      yaml: executableYaml,
      definition: executableWorkflow,
    },
    { isEphemeral: true }
  );

  const result = await executeWorkflow(
    model,
    {
      inputs: {
        proposalId,
        action,
        hostName: hostName ?? "",
      },
    },
    request
  );

  logger.info(
    `daybreak response-action worker executed — workflowExecutionId=${result.workflowExecutionId}, proposalId=${proposalId}, action=${action}`
  );

  return result;
};
