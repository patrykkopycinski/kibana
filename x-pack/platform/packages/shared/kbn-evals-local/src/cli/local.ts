/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { spawn as spawnChild } from 'node:child_process';
import { totalmem } from 'node:os';
import { resolve } from 'node:path';
import { detect } from '../local/detect';
import { ModelRegistry } from '../local/model_registry';
import { negotiateModel } from '../local/model_negotiator';
import { ensureRuntime, ensureModel } from '../local/provision';
import { teardown } from '../local/teardown';
import { setLocalConnectorEnv } from '../local/connector_factory';
import { setTierEnv } from '../local/tier_config';

const log = {
  info: (msg: string) => process.stderr.write(`[evals-local] ${msg}\n`),
  error: (msg: string) => process.stderr.write(`[evals-local] ERROR: ${msg}\n`),
};

interface CliOptions {
  suite?: string;
  model?: string;
  endpoint?: string;
  codeOnly: boolean;
  keepLoaded: boolean;
  stopServer: boolean;
  validateOnly: boolean;
  listModels: boolean;
  args: string[];
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    codeOnly: false,
    keepLoaded: false,
    stopServer: false,
    validateOnly: false,
    listModels: false,
    args: [],
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--suite': {
        const value = args[++i];
        if (!value || value.startsWith('--')) {
          throw new Error(`--suite requires a value, got: ${value}`);
        }
        options.suite = value;
        break;
      }
      case '--model': {
        const value = args[++i];
        if (!value || value.startsWith('--')) {
          throw new Error(`--model requires a value, got: ${value}`);
        }
        options.model = value;
        break;
      }
      case '--endpoint': {
        const value = args[++i];
        if (!value || value.startsWith('--')) {
          throw new Error(`--endpoint requires a value, got: ${value}`);
        }
        options.endpoint = value;
        break;
      }
      case '--code-only':
        options.codeOnly = true;
        break;
      case '--keep-loaded':
        options.keepLoaded = true;
        break;
      case '--stop-server':
        options.stopServer = true;
        break;
      case '--validate-only':
        options.validateOnly = true;
        break;
      case '--list-models':
        options.listModels = true;
        break;
      default:
        if (arg === 'red-team') {
          options.codeOnly = true;
          options.args.push(arg);
        } else {
          options.args.push(arg);
        }
    }
  }

  return options;
}

function listModels(): void {
  const registry = new ModelRegistry();
  const models = registry.listForRam();
  const ram = Math.round(totalmem() / (1024 * 1024 * 1024));

  log.info(`System RAM: ${ram} GB`);
  log.info('');
  log.info('Available models for this machine:');
  log.info('');

  for (const m of models) {
    const recommended = m.priority === models[0]?.priority ? ' [RECOMMENDED]' : '';
    log.info(`  ${m.id}${recommended}`);
    log.info(`    ${m.name} (${m.paramsBillions}B, ${m.quantization}, ${m.vramGb}GB VRAM)`);
    log.info(`    Judge quality: ${m.judgeQuality} | Speed: ~${m.tokPerSecEstimate} tok/s`);
    if (m.notes) log.info(`    Note: ${m.notes}`);
    log.info('');
  }
}

export const localCli = {
  async run(args: string[]): Promise<void> {
    const options = parseArgs(args);

    if (options.listModels) {
      listModels();
      return;
    }

    const registry = new ModelRegistry();
    const detection = await detect(options.endpoint);

    log.info(`Runtime: ${detection.runtime}`);
    if (detection.endpoint) log.info(`Endpoint: ${detection.endpoint}`);
    if (detection.loadedModel) log.info(`Loaded model: ${detection.loadedModel.name}`);

    const negotiation = await negotiateModel(detection, options.model, registry);
    log.info(negotiation.reason);

    const codeOnly = options.codeOnly || negotiation.codeOnlyFallback === true;

    let endpoint: string;
    const modelToUse = negotiation.model;
    let actualRuntime = detection.runtime;

    if (negotiation.action === 'provision') {
      actualRuntime = await ensureRuntime();
      endpoint = await ensureModel(actualRuntime, modelToUse);
    } else {
      endpoint = detection.endpoint!;
    }

    if (options.validateOnly) {
      log.info('Validation complete. Model is ready for evals.');
      return;
    }

    setLocalConnectorEnv(endpoint, modelToUse.ollamaTag || modelToUse.name);
    setTierEnv(codeOnly);

    try {
      const evalArgs = ['run'];
      if (options.suite) {
        evalArgs.push('--suite', options.suite);
      }
      evalArgs.push(...options.args);

      log.info(`Running evals: node scripts/evals ${evalArgs.join(' ')}`);

      const kibanaRoot =
        process.env.REPO_ROOT ?? resolve(__dirname, '..', '..', '..', '..', '..', '..', '..');
      const child = spawnChild('node', [resolve(kibanaRoot, 'scripts/evals'), ...evalArgs], {
        cwd: kibanaRoot,
        stdio: 'inherit',
        env: { ...process.env },
      });

      const exitCode = await new Promise<number>((resolvePromise) => {
        child.on('close', (code) => resolvePromise(code ?? 1));
        child.on('error', (err) => {
          log.error(`Failed to spawn eval process: ${err.message}`);
          resolvePromise(127);
        });
      });

      if (exitCode !== 0) {
        process.exitCode = exitCode;
      }
    } finally {
      await teardown({
        runtime: actualRuntime,
        modelTag: modelToUse.ollamaTag || modelToUse.name,
        keepLoaded: options.keepLoaded,
        serverWasRunning: detection.serverWasRunning,
        stopServer: options.stopServer,
      });
    }
  },
};
