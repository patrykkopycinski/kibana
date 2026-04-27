/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { totalmem } from 'node:os';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const modelsData = require('./models.json') as ModelsJson;

export type JudgeQuality = 'excellent' | 'very-good' | 'good' | 'fair' | 'poor' | 'unknown';

export interface ModelConfig {
  id: string;
  ollamaTag: string;
  lmsSearchId: string;
  name: string;
  type: 'dense' | 'moe';
  paramsBillions: number;
  quantization: string;
  vramGb: number;
  minRamGb: number;
  toolCalling: boolean;
  judgeQuality: JudgeQuality;
  tokPerSecEstimate: number;
  contextLength: number;
  priority: number;
  notes?: string;
}

interface ModelsJson {
  platform: string;
  preferredRuntime: string;
  models: ModelConfig[];
}

function getSystemRamGb(): number {
  return Math.round(totalmem() / (1024 * 1024 * 1024));
}

export class ModelRegistry {
  private models: ModelConfig[];

  constructor() {
    this.models = modelsData.models;
  }

  getAll(): ModelConfig[] {
    return [...this.models];
  }

  findById(id: string): ModelConfig | undefined {
    return this.models.find((m) => m.id === id);
  }

  findByModelName(name: string): ModelConfig | undefined {
    return this.models.find(
      (m) => m.ollamaTag === name || m.name.toLowerCase() === name.toLowerCase() || m.id === name
    );
  }

  resolve(modelArg: string): ModelConfig {
    const found = this.findById(modelArg) ?? this.findByModelName(modelArg);
    if (found) return found;
    return this.createAdHoc(modelArg);
  }

  autoSelect(ramGb?: number): ModelConfig {
    const ram = ramGb ?? getSystemRamGb();
    const eligible = this.models
      .filter((m) => m.minRamGb <= ram)
      .sort((a, b) => a.priority - b.priority);
    if (eligible.length === 0) {
      return this.models[this.models.length - 1];
    }
    return eligible[0];
  }

  listForRam(ramGb?: number): ModelConfig[] {
    const ram = ramGb ?? getSystemRamGb();
    return this.models.filter((m) => m.minRamGb <= ram).sort((a, b) => a.priority - b.priority);
  }

  createAdHoc(name: string): ModelConfig {
    return {
      id: name,
      ollamaTag: name,
      lmsSearchId: name,
      name,
      type: 'dense',
      paramsBillions: 0,
      quantization: 'Q4_K_M',
      vramGb: 0,
      minRamGb: 0,
      toolCalling: false,
      judgeQuality: 'unknown',
      tokPerSecEstimate: 0,
      contextLength: 8192,
      priority: 99,
      notes: 'Ad-hoc model -- not in curated registry. Tool calling will be validated at runtime.',
    };
  }
}
