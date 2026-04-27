/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { execSync } from 'node:child_process';
import type { RuntimeType } from './detect';

const log = {
  info: (msg: string) => process.stderr.write(`[evals-local] ${msg}\n`),
  warn: (msg: string) => process.stderr.write(`[evals-local] WARN: ${msg}\n`),
};

export interface TeardownOptions {
  runtime: RuntimeType;
  modelTag: string;
  keepLoaded: boolean;
  serverWasRunning: boolean;
  stopServer?: boolean;
}

export async function teardown(options: TeardownOptions): Promise<void> {
  if (options.keepLoaded) {
    log.info('--keep-loaded: model stays in memory for fast re-runs.');
    return;
  }

  if (options.runtime === 'ollama') {
    try {
      await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: options.modelTag, keep_alive: 0 }),
      });
      log.info('Model scheduled for unload -- memory freed.');
    } catch (e) {
      log.warn(`Failed to unload model: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (options.stopServer && !options.serverWasRunning) {
      try {
        execSync('pkill -f "ollama serve"', { stdio: 'pipe', timeout: 5000 });
        log.info('Ollama server stopped.');
      } catch {
        // process may already be gone
      }
    }
  } else {
    try {
      execSync('lms unload --all', { stdio: 'pipe', timeout: 15_000 });
      log.info('Model unloaded -- memory freed.');
    } catch (e) {
      log.warn(`Failed to unload model: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (options.stopServer && !options.serverWasRunning) {
      try {
        execSync('lms server stop', { stdio: 'pipe', timeout: 10_000 });
      } catch {
        // may already be stopped
      }
    }
  }
}
