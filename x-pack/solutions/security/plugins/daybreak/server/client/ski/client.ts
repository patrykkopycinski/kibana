/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { SkiNotFoundError } from './errors';
import { createSkiStorage } from './storage';
import type { SkiDocument, SecurityKnowledgeIndicatorProperties } from './types';

const MAX_SKI_PER_SPACE = 1000;
const createSpaceFilter = (space: string) => ({ term: { space } });

export interface SkiClient {
  get(id: string): Promise<SecurityKnowledgeIndicatorProperties>;
  list(): Promise<SecurityKnowledgeIndicatorProperties[]>;
  create(input: SkiCreateParams): Promise<SecurityKnowledgeIndicatorProperties>;
}

export interface SkiCreateParams {
  id: string;
  type: SecurityKnowledgeIndicatorProperties['type'];
  normalizedName: string;
  source: string;
  collectedAt?: string;
  confidence: number;
  scope: string;
  supportingEvidence?: string[];
  relatedRefs?: string[];
  expiresAt?: string;
  sourceWatch?: string;
}

class SkiClientImpl implements SkiClient {
  private readonly storage;

  constructor(
    private readonly space: string,
    private readonly logger: Logger,
    esClient: ElasticsearchClient
  ) {
    this.storage = createSkiStorage({ logger, esClient });
  }

  async get(id: string): Promise<SecurityKnowledgeIndicatorProperties> {
    const document = await this.getById(id);
    if (!document) throw new SkiNotFoundError(id);
    return document._source!;
  }

  async list(): Promise<SecurityKnowledgeIndicatorProperties[]> {
    const response = await this.storage.getClient().search({
      query: { bool: { filter: [createSpaceFilter(this.space)] } },
      size: MAX_SKI_PER_SPACE,
      sort: [{ collectedAt: 'desc' }],
      track_total_hits: true,
    });
    const total =
      typeof response.hits.total === 'number'
        ? response.hits.total
        : response.hits.total?.value ?? 0;
    if (total > MAX_SKI_PER_SPACE) {
      this.logger.warn(`Space "${this.space}" has more than ${MAX_SKI_PER_SPACE} SKI records.`);
    }
    return response.hits.hits.map((hit) => hit._source as SecurityKnowledgeIndicatorProperties);
  }

  async create(input: SkiCreateParams): Promise<SecurityKnowledgeIndicatorProperties> {
    const existing = await this.getById(input.id);
    const now = new Date().toISOString();
    const ski: SecurityKnowledgeIndicatorProperties = {
      ...input,
      collectedAt: input.collectedAt ?? now,
      supportingEvidence: input.supportingEvidence ?? [],
      relatedRefs: input.relatedRefs ?? [],
      space: this.space,
    };
    await this.deleteAllById(input.id);
    await this.storage.getClient().index({ id: input.id, document: ski });
    return this.get(input.id);
  }

  private async deleteAllById(id: string): Promise<void> {
    const response = await this.storage.getClient().search({
      query: { bool: { filter: [createSpaceFilter(this.space), { term: { id } }] } },
      size: 100,
      track_total_hits: true,
    });
    for (const hit of response.hits.hits) {
      if (hit._id) {
        await this.storage.getClient().delete({ id: hit._id });
      }
    }
  }

  private async getById(id: string): Promise<SkiDocument | undefined> {
    const response = await this.storage.getClient().search({
      query: { bool: { filter: [createSpaceFilter(this.space), { term: { id } }] } },
      sort: [{ collectedAt: 'desc' }],
      size: 1,
      terminate_after: 1,
      track_total_hits: false,
    });
    const hit = response.hits.hits[0];
    return hit ? ({ _id: hit._id!, _source: hit._source } as SkiDocument) : undefined;
  }
}

export const createSkiClient = ({
  space,
  logger,
  esClient,
}: {
  space: string;
  logger: Logger;
  esClient: ElasticsearchClient;
}): SkiClient => new SkiClientImpl(space, logger, esClient);
