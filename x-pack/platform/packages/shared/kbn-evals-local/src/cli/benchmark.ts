/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { spawn as spawnChild } from 'node:child_process';
import { resolve } from 'node:path';
import { detect } from '../local/detect';
import { ModelRegistry } from '../local/model_registry';
import type { ModelConfig } from '../local/model_registry';
import { ensureRuntime, ensureModel } from '../local/provision';
import { teardown } from '../local/teardown';
import { setLocalConnectorEnv } from '../local/connector_factory';
import { validateToolCalling } from '../local/model_validator';
import { writeResult, updateRegistry, generateRecommendations } from '../benchmark/result_writer';

const log = {
  info: (msg: string) => process.stderr.write(`[evals-local:benchmark] ${msg}\n`),
  error: (msg: string) => process.stderr.write(`[evals-local:benchmark] ERROR: ${msg}\n`),
};

const DEFAULT_BENCHMARK_SUITE = 'llm-tasks';

interface BenchmarkOptions {
  model?: string;
  all: boolean;
  suite: string;
  updateRegistry: boolean;
  createPr: boolean;
}

export interface BenchmarkResult {
  modelId: string;
  modelName: string;
  ollamaTag: string;
  suite: string;
  toolCallingPass: boolean;
  tokPerSec: number;
  evalExitCode: number;
  startedAt: string;
  durationMs: number;
  date: string;
}

function parseBenchmarkArgs(args: string[]): BenchmarkOptions {
  const options: BenchmarkOptions = {
    all: false,
    suite: DEFAULT_BENCHMARK_SUITE,
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

async function benchmarkSingleModel(model: ModelConfig, suite: string): Promise<BenchmarkResult> {
  const startedAt = new Date().toISOString();
  const startTime = Date.now();

  const detection = await detect();
  let endpoint: string;
  let actualRuntime = detection.runtime;

  try {
    if (detection.endpoint && detection.loadedModel?.name === model.ollamaTag) {
      endpoint = detection.endpoint;
    } else {
      actualRuntime = await ensureRuntime();
      endpoint = await ensureModel(actualRuntime, model);
    }
  } catch (e) {
    return {
      modelId: model.id,
      modelName: model.name,
      ollamaTag: model.ollamaTag,
      suite,
      toolCallingPass: false,
      tokPerSec: 0,
      evalExitCode: 1,
      startedAt,
      durationMs: Date.now() - startTime,
      date: new Date().toISOString().split('T')[0],
    };
  }

  // Warm up the model so it's loaded in GPU before validation
  log.info('Warming up model...');
  try {
    const warmupUrl = endpoint.replace('/v1', '') + '/api/generate';
    await fetch(warmupUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model.ollamaTag, prompt: 'hi', stream: false }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    // warmup via chat completions fallback
    try {
      const chatUrl = endpoint.endsWith('/v1')
        ? `${endpoint}/chat/completions`
        : `${endpoint}/v1/chat/completions`;
      await fetch(chatUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer local-eval' },
        body: JSON.stringify({
          model: model.ollamaTag,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      // proceed anyway
    }
  }

  const toolCallingPass = await validateToolCalling(endpoint, model.ollamaTag);
  log.info(`Tool calling: ${toolCallingPass ? 'PASS' : 'FAIL'}`);

  setLocalConnectorEnv(endpoint, model.ollamaTag);

  const kibanaRoot =
    process.env.REPO_ROOT ?? resolve(__dirname, '..', '..', '..', '..', '..', '..', '..');
  const evalArgs = ['run', '--suite', suite];

  log.info(`Running eval suite: ${suite}`);
  const evalStart = Date.now();

  const evalExitCode = await new Promise<number>((resolvePromise) => {
    const child = spawnChild('node', [resolve(kibanaRoot, 'scripts/evals'), ...evalArgs], {
      cwd: kibanaRoot,
      stdio: 'inherit',
      env: { ...process.env },
    });
    child.on('close', (code) => resolvePromise(code ?? 1));
    child.on('error', (err) => {
      log.error(`Failed to spawn eval process: ${err.message}`);
      resolvePromise(127);
    });
  });

  const evalDuration = Date.now() - evalStart;
  const tokPerSec = model.tokPerSecEstimate;

  await teardown({
    runtime: actualRuntime,
    modelTag: model.ollamaTag,
    keepLoaded: false,
    serverWasRunning: detection.serverWasRunning,
  });

  return {
    modelId: model.id,
    modelName: model.name,
    ollamaTag: model.ollamaTag,
    suite,
    toolCallingPass,
    tokPerSec,
    evalExitCode,
    startedAt,
    durationMs: evalDuration,
    date: new Date().toISOString().split('T')[0],
  };
}

function printResultsTable(results: BenchmarkResult[]): void {
  const header = 'Model                       | tok/s | Tool Call | Exit | Duration';
  const separator = '----------------------------|-------|-----------|------|----------';

  log.info('');
  log.info('Benchmark Results');
  log.info('=================');
  log.info('');
  log.info(header);
  log.info(separator);

  for (const r of results) {
    const name = r.modelName.padEnd(28);
    const tps = String(r.tokPerSec).padStart(5);
    const tc = r.toolCallingPass ? 'PASS     ' : 'FAIL     ';
    const exit = String(r.evalExitCode).padStart(4);
    const dur = `${Math.round(r.durationMs / 1000)}s`.padStart(10);
    log.info(`${name}| ${tps} | ${tc}| ${exit} | ${dur}`);
  }

  log.info('');
}

async function createBenchmarkPr(results: BenchmarkResult[]): Promise<void> {
  const { execFileSync } = await import('node:child_process');

  const modelNames = results.map((r) => r.modelId).join(', ');
  const branchName = `evals-local/benchmark/${results[0]?.modelId ?? 'all'}-${
    new Date().toISOString().split('T')[0]
  }`;

  const kibanaRoot =
    process.env.REPO_ROOT ?? resolve(__dirname, '..', '..', '..', '..', '..', '..', '..');
  const pkgDir = 'x-pack/platform/packages/shared/kbn-evals-local';

  const exec = (cmd: string, args: string[]) =>
    execFileSync(cmd, args, { cwd: kibanaRoot, encoding: 'utf8', stdio: 'pipe' }).trim();

  try {
    exec('git', ['checkout', '-b', branchName]);
    exec('git', [
      'add',
      `${pkgDir}/src/local/models.json`,
      `${pkgDir}/RECOMMENDATIONS.md`,
      `${pkgDir}/benchmark-results/`,
    ]);
    exec('git', ['commit', '-m', `[evals-local] Add benchmark results for ${modelNames}`]);
    exec('git', ['push', '-u', 'origin', branchName]);

    const body = [
      '## Benchmark Results',
      '',
      `Models: ${modelNames}`,
      `Suite: ${results[0]?.suite ?? 'default'}`,
      '',
      '| Model | tok/s | Tool Calling | Exit Code | Duration |',
      '|-------|-------|-------------|-----------|----------|',
      ...results.map(
        (r) =>
          `| ${r.modelName} | ${r.tokPerSec} | ${r.toolCallingPass ? 'PASS' : 'FAIL'} | ${
            r.evalExitCode
          } | ${Math.round(r.durationMs / 1000)}s |`
      ),
      '',
      'Auto-generated by `node scripts/evals local benchmark --create-pr`',
    ].join('\n');

    const prUrl = exec('gh', [
      'pr',
      'create',
      '--title',
      `[evals-local] Add benchmark results for ${modelNames}`,
      '--body',
      body,
      '--label',
      'non-issue',
      '--draft',
    ]);

    log.info(`PR created: ${prUrl}`);
  } catch (e) {
    log.error(`Failed to create PR: ${e instanceof Error ? e.message : String(e)}`);
  }
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

    log.info(`Benchmarking ${modelsToTest.length} model(s) with suite: ${options.suite}`);
    log.info('');

    const results: BenchmarkResult[] = [];

    for (const model of modelsToTest) {
      log.info(`--- ${model.name} (${model.id}) ---`);
      const result = await benchmarkSingleModel(model, options.suite);
      results.push(result);

      const pkgDir = resolve(__dirname, '..', '..');
      writeResult(result, pkgDir);
    }

    printResultsTable(results);

    if (options.updateRegistry) {
      const pkgDir = resolve(__dirname, '..', '..');
      updateRegistry(results, pkgDir);
      generateRecommendations(pkgDir);
      log.info('Registry updated: models.json, RECOMMENDATIONS.md');
    }

    if (options.createPr) {
      await createBenchmarkPr(results);
    }
  },
};
