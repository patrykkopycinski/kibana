/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { detect } from '../local/detect';
import { ModelRegistry } from '../local/model_registry';
import { ensureRuntime, ensureModel } from '../local/provision';
import { teardown } from '../local/teardown';

const log = {
  info: (msg: string) => process.stderr.write(`[evals-local:benchmark] ${msg}\n`),
  error: (msg: string) => process.stderr.write(`[evals-local:benchmark] ERROR: ${msg}\n`),
};

interface BenchmarkOptions {
  model?: string;
  all: boolean;
  suite?: string;
  updateRegistry: boolean;
  createPr: boolean;
}

function parseBenchmarkArgs(args: string[]): BenchmarkOptions {
  const options: BenchmarkOptions = {
    all: false,
    updateRegistry: false,
    createPr: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--model') {
      const value = args[++i];
      if (!value || value.startsWith('--')) {
        throw new Error(`--model requires a value, got: ${value}`);
      }
      options.model = value;
    } else if (arg === '--all') options.all = true;
    else if (arg === '--suite') {
      const value = args[++i];
      if (!value || value.startsWith('--')) {
        throw new Error(`--suite requires a value, got: ${value}`);
      }
      options.suite = value;
    } else if (arg === '--update-registry') options.updateRegistry = true;
    else if (arg === '--create-pr') options.createPr = true;
  }

  return options;
}

export const benchmarkCli = {
  async run(args: string[]): Promise<void> {
    const options = parseBenchmarkArgs(args);
    const registry = new ModelRegistry();

    const modelsToTest = options.all
      ? registry.listForRam()
      : options.model
      ? [registry.resolve(options.model)]
      : [registry.autoSelect()];

    log.info(`Benchmarking ${modelsToTest.length} model(s)...`);

    for (const model of modelsToTest) {
      log.info(`--- ${model.name} (${model.id}) ---`);

      const detection = await detect();
      const runtime = detection.runtime;
      let endpoint: string;

      try {
        endpoint = detection.endpoint ?? (await ensureModel(await ensureRuntime(), model));
      } catch (e) {
        log.error(
          `Failed to provision ${model.name}: ${e instanceof Error ? e.message : String(e)}`
        );
        continue;
      }

      log.info(`Model ready at ${endpoint}`);
      log.info(
        'Benchmark execution not yet implemented -- collecting model availability data only.'
      );

      await teardown({
        runtime,
        modelTag: model.ollamaTag,
        keepLoaded: false,
        serverWasRunning: detection.serverWasRunning,
      });
    }

    log.info('Benchmark complete.');
  },
};
