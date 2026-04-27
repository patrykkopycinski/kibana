/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { execSync } from 'node:child_process';

export type RuntimeType = 'ollama' | 'lm-studio';

export interface LoadedModel {
  name: string;
  size?: string;
}

export interface DetectionResult {
  runtime: RuntimeType;
  endpoint: string | null;
  loadedModel: LoadedModel | null;
  serverWasRunning: boolean;
}

async function probeEndpoint(url: string, timeoutMs = 3000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return response.ok || response.status === 200;
  } catch {
    return false;
  }
}

async function getOllamaModels(endpoint: string): Promise<LoadedModel | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${endpoint}/api/ps`, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return null;
    const data = (await response.json()) as { models?: Array<{ name: string; size?: number }> };
    if (data.models && data.models.length > 0) {
      const model = data.models[0];
      return {
        name: model.name,
        size: model.size ? `${Math.round(model.size / (1024 * 1024 * 1024))}GB` : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function getLmStudioModel(endpoint: string): Promise<LoadedModel | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${endpoint}/v1/models`, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return null;
    const data = (await response.json()) as { data?: Array<{ id: string }> };
    if (data.data && data.data.length > 0) {
      return { name: data.data[0].id };
    }
    return null;
  } catch {
    return null;
  }
}

function commandExists(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export async function detect(customEndpoint?: string): Promise<DetectionResult> {
  if (customEndpoint) {
    const isOllama = customEndpoint.includes('11434');
    const runtime: RuntimeType = isOllama ? 'ollama' : 'lm-studio';
    const loadedModel = isOllama
      ? await getOllamaModels(customEndpoint.replace('/v1', ''))
      : await getLmStudioModel(customEndpoint.replace('/v1', ''));
    return {
      runtime,
      endpoint: customEndpoint.endsWith('/v1') ? customEndpoint : `${customEndpoint}/v1`,
      loadedModel,
      serverWasRunning: true,
    };
  }

  const ollamaEndpoint = 'http://localhost:11434';
  const lmsEndpoint = 'http://localhost:1234';

  const ollamaRunning = await probeEndpoint(ollamaEndpoint);
  if (ollamaRunning) {
    const loadedModel = await getOllamaModels(ollamaEndpoint);
    return {
      runtime: 'ollama',
      endpoint: `${ollamaEndpoint}/v1`,
      loadedModel,
      serverWasRunning: true,
    };
  }

  const lmsRunning = await probeEndpoint(`${lmsEndpoint}/v1/models`);
  if (lmsRunning) {
    const loadedModel = await getLmStudioModel(lmsEndpoint);
    return {
      runtime: 'lm-studio',
      endpoint: `${lmsEndpoint}/v1`,
      loadedModel,
      serverWasRunning: true,
    };
  }

  if (commandExists('ollama')) {
    return {
      runtime: 'ollama',
      endpoint: null,
      loadedModel: null,
      serverWasRunning: false,
    };
  }

  if (commandExists('lms')) {
    return {
      runtime: 'lm-studio',
      endpoint: null,
      loadedModel: null,
      serverWasRunning: false,
    };
  }

  return {
    runtime: 'ollama',
    endpoint: null,
    loadedModel: null,
    serverWasRunning: false,
  };
}
