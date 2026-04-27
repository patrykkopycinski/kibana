/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { execSync, spawn } from 'node:child_process';
import type { RuntimeType } from './detect';
import type { ModelConfig } from './models';

const log = {
  info: (msg: string) => process.stderr.write(`[evals-local] ${msg}\n`),
  warn: (msg: string) => process.stderr.write(`[evals-local] WARN: ${msg}\n`),
};

function exec(cmd: string, timeoutMs = 60_000): string {
  return execSync(cmd, {
    encoding: 'utf8',
    timeout: timeoutMs,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function commandExists(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function waitForEndpoint(url: string, maxMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`Timed out waiting for ${url} after ${maxMs}ms`);
}

export async function ensureRuntime(): Promise<RuntimeType> {
  if (commandExists('ollama')) return 'ollama';
  if (commandExists('lms')) return 'lm-studio';

  log.info('No local runtime found. Installing Ollama...');
  if (process.platform === 'darwin') {
    exec('brew install --quiet ollama', 120_000);
  } else {
    exec('curl -fsSL https://ollama.com/install.sh | sh', 120_000);
  }
  return 'ollama';
}

async function isOllamaServing(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    await fetch('http://localhost:11434', { signal: controller.signal });
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}

export async function ensureModel(runtime: RuntimeType, model: ModelConfig): Promise<string> {
  if (runtime === 'ollama') {
    try {
      const models = exec('ollama list');
      if (!models.includes(model.ollamaTag.split(':')[0])) {
        log.info(`Pulling ${model.name} (${model.ollamaTag})...`);
        exec(`ollama pull ${model.ollamaTag}`, 600_000);
      } else {
        log.info(`Model ${model.name} already available.`);
      }
    } catch {
      log.info(`Pulling ${model.name} (${model.ollamaTag})...`);
      exec(`ollama pull ${model.ollamaTag}`, 600_000);
    }

    if (!(await isOllamaServing())) {
      log.info('Starting Ollama server...');
      const child = spawn('ollama', ['serve'], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      await waitForEndpoint('http://localhost:11434');
    }
    return 'http://localhost:11434/v1';
  }

  try {
    exec('lms status');
  } catch {
    exec('lms daemon up', 30_000);
    await waitForEndpoint('http://localhost:1234/v1/models');
  }

  try {
    const installed = exec('lms ls');
    if (!installed.includes(model.lmsSearchId)) {
      log.info(`Downloading ${model.name} via LM Studio...`);
      exec(`lms get ${model.lmsSearchId} --mlx`, 600_000);
    }
  } catch {
    log.info(`Downloading ${model.name} via LM Studio...`);
    exec(`lms get ${model.lmsSearchId} --mlx`, 600_000);
  }

  exec(`lms load ${model.lmsSearchId} --gpu max --context-length ${model.contextLength}`, 60_000);
  exec('lms server start --port 1234 --cors', 15_000);
  await waitForEndpoint('http://localhost:1234/v1/models');
  return 'http://localhost:1234/v1';
}
