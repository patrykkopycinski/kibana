/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { detect } from '../local/detect';
import { setLocalConnectorEnv } from '../local/connector_factory';

const log = {
  info: (msg: string) => process.stderr.write(`[evals-local] ${msg}\n`),
  warn: (msg: string) => process.stderr.write(`[evals-local] WARN: ${msg}\n`),
};

/**
 * Lightweight connector injection for --local flag on any existing evals command.
 * Probes a running local endpoint, discovers the model name, and sets env vars.
 * Does NOT provision or teardown -- assumes the runtime is already running.
 */
export async function injectLocalConnector(args: string[]): Promise<void> {
  let localEndpoint: string | undefined;
  let localModel: string | undefined;

  const filteredArgs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--local') continue;
    if (args[i] === '--local-endpoint') {
      const value = args[++i];
      if (!value || value.startsWith('--')) {
        throw new Error(`--local-endpoint requires a value, got: ${value}`);
      }
      localEndpoint = value;
      continue;
    }
    if (args[i] === '--local-model') {
      const value = args[++i];
      if (!value || value.startsWith('--')) {
        throw new Error(`--local-model requires a value, got: ${value}`);
      }
      localModel = value;
      continue;
    }
    filteredArgs.push(args[i]);
  }

  args.length = 0;
  args.push(...filteredArgs);

  const detection = await detect(localEndpoint);

  if (!detection.endpoint) {
    log.warn(
      'No local runtime detected. Start Ollama or LM Studio, or use "node scripts/evals local" for auto-provisioning.'
    );
    return;
  }

  const modelName = localModel ?? detection.loadedModel?.name ?? 'local-model';
  setLocalConnectorEnv(detection.endpoint, modelName);
  log.info(`Local connector injected: ${modelName} at ${detection.endpoint}`);
}
