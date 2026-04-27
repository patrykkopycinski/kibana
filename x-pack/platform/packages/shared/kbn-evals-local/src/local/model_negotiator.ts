/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as readline from 'node:readline';
import type { DetectionResult } from './detect';
import type { ModelConfig, ModelRegistry } from './model_registry';
import { validateToolCalling } from './model_validator';

const log = {
  info: (msg: string) => process.stderr.write(`[evals-local] ${msg}\n`),
  warn: (msg: string) => process.stderr.write(`[evals-local] WARN: ${msg}\n`),
};

export interface NegotiationResult {
  action: 'reuse' | 'provision';
  model: ModelConfig;
  reason: string;
  codeOnlyFallback?: boolean;
}

async function promptUser(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    let answered = false;
    rl.question(question, (answer) => {
      answered = true;
      rl.close();
      resolve(!answer || answer.toLowerCase().startsWith('y'));
    });
    rl.on('close', () => {
      if (!answered) {
        resolve(false);
      }
    });
  });
}

export async function negotiateModel(
  detection: DetectionResult,
  requestedModel: string | undefined,
  registry: ModelRegistry
): Promise<NegotiationResult> {
  if (requestedModel) {
    const requested = registry.resolve(requestedModel);
    if (detection.loadedModel?.name === requested.ollamaTag) {
      return { action: 'reuse', model: requested, reason: 'Requested model already loaded.' };
    }
    return {
      action: 'provision',
      model: requested,
      reason: `Swapping to requested model: ${requested.name}`,
    };
  }

  if (!detection.loadedModel) {
    const best = registry.autoSelect();
    return { action: 'provision', model: best, reason: `No model loaded. Pulling ${best.name}.` };
  }

  const loaded = detection.loadedModel;
  const registryEntry = registry.findByModelName(loaded.name);
  const toolCallOk = detection.endpoint ? await validateToolCalling(detection.endpoint) : false;

  if (toolCallOk && registryEntry && registryEntry.judgeQuality !== 'poor') {
    log.info(`Found loaded model: ${loaded.name} (${registryEntry.judgeQuality} quality)`);
    const best = registry.autoSelect();
    if (registryEntry.id === best.id) {
      log.info('Already the recommended model for this machine.');
    } else {
      log.info(`Good enough for local evals (quality: ${registryEntry.judgeQuality}).`);
      log.info(`Tip: ${best.name} would give better results. Use --model ${best.id} to switch.`);
    }
    return {
      action: 'reuse',
      model: registryEntry,
      reason: `Reusing loaded model: ${loaded.name}`,
    };
  }

  if (toolCallOk && !registryEntry) {
    log.warn(`Unknown model "${loaded.name}" -- not in curated registry.`);
    log.info('Tool calling works. Proceeding with this model (results may vary).');
    return {
      action: 'reuse',
      model: registry.createAdHoc(loaded.name),
      reason: 'Unknown model, tool calling OK.',
    };
  }

  const best = registry.autoSelect();
  const reason = !toolCallOk
    ? `Loaded model "${loaded.name}" does not support tool calling (required for LLM-as-judge evaluators).`
    : `Loaded model "${loaded.name}" has poor judge quality.`;

  if (process.stdin.isTTY) {
    log.warn(reason);
    const confirm = await promptUser(
      `Unload "${loaded.name}" and pull ${best.name} (${best.judgeQuality} quality)? [Y/n] `
    );
    if (confirm) {
      return { action: 'provision', model: best, reason: `Swapping to ${best.name}.` };
    }
    log.info('Keeping current model. LLM-as-judge evaluators will be skipped (CODE-only mode).');
    return {
      action: 'reuse',
      model: registry.createAdHoc(loaded.name),
      reason: 'User chose to keep inadequate model.',
      codeOnlyFallback: true,
    };
  }

  return { action: 'provision', model: best, reason: `${reason} Auto-swapping to ${best.name}.` };
}
