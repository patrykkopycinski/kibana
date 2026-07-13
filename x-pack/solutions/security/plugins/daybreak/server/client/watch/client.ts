/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { WatchNotFoundError } from './errors';
import { createWatchesStorage } from './storage';
import type { WatchDocument, WatchProperties } from './types';

const MAX_WATCHES_PER_SPACE = 1000;
const createSpaceFilter = (space: string) => ({ term: { space } });

export interface WatchClient {
  get(id: string): Promise<WatchProperties>;
  list(): Promise<WatchProperties[]>;
  create(input: WatchCreateParams): Promise<WatchProperties>;
  update(id: string, updates: WatchUpdateParams): Promise<WatchProperties>;
  delete(id: string): Promise<boolean>;
}

export interface WatchCreateParams {
  id: string;
  name: string;
  description: string;
  surface: string;
  status?: WatchProperties['status'];
  autonomyTier: WatchProperties['autonomyTier'];
  skillIds?: string[];
}

export interface WatchUpdateParams {
  name?: string;
  description?: string;
  surface?: string;
  status?: WatchProperties['status'];
  autonomyTier?: WatchProperties['autonomyTier'];
  skillIds?: string[];
}

class WatchClientImpl implements WatchClient {
  private readonly storage;

  constructor(
    private readonly space: string,
    private readonly logger: Logger,
    esClient: ElasticsearchClient
  ) {
    this.storage = createWatchesStorage({ logger, esClient });
  }

  async get(id: string): Promise<WatchProperties> {
    const document = await this.getById(id);
    if (!document) throw new WatchNotFoundError(id);
    return document._source!;
  }

  async list(): Promise<WatchProperties[]> {
    const response = await this.storage.getClient().search({
      query: { bool: { filter: [createSpaceFilter(this.space)] } },
      size: MAX_WATCHES_PER_SPACE,
      sort: [{ updatedAt: 'desc' }],
      track_total_hits: true,
    });
    const total =
      typeof response.hits.total === 'number'
        ? response.hits.total
        : response.hits.total?.value ?? 0;
    if (total > MAX_WATCHES_PER_SPACE)
      this.logger.warn(`Space "${this.space}" has more than ${MAX_WATCHES_PER_SPACE} watches.`);
    return response.hits.hits.map((hit) => hit._source as WatchProperties);
  }

  async create(input: WatchCreateParams): Promise<WatchProperties> {
    const existing = await this.getById(input.id);
    const now = new Date().toISOString();
    const watch: WatchProperties = {
      ...input,
      status: input.status ?? 'draft',
      skillIds: input.skillIds ?? [],
      createdAt: existing?._source?.createdAt ?? now,
      updatedAt: now,
      space: this.space,
    };
    await this.deleteAllById(input.id);
    await this.storage.getClient().index({ id: input.id, document: watch });
    return this.get(input.id);
  }

  async update(id: string, updates: WatchUpdateParams): Promise<WatchProperties> {
    const document = await this.getById(id);
    if (!document) throw new WatchNotFoundError(id);
    const watch: WatchProperties = {
      ...document._source!,
      ...updates,
      id: document._source!.id,
      space: document._source!.space,
      updatedAt: new Date().toISOString(),
    };
    await this.deleteAllById(id);
    await this.storage.getClient().index({ id, document: watch });
    return this.get(id);
  }

  async delete(id: string): Promise<boolean> {
    const document = await this.getById(id);
    if (!document) return false;
    const result = await this.storage.getClient().delete({ id: document._id });
    return result.result === 'deleted';
  }

  private async deleteAllById(id: string): Promise<void> {
    const response = await this.storage.getClient().search({
      query: { bool: { filter: [createSpaceFilter(this.space), { term: { id } }] } },
      size: 100,
      track_total_hits: true,
    });
    const total =
      typeof response.hits.total === 'number'
        ? response.hits.total
        : response.hits.total?.value ?? 0;
    if (total > 100) {
      this.logger.warn(`More than 100 duplicate documents found for watch ${id}; truncating cleanup.`);
    }
    for (const hit of response.hits.hits) {
      if (hit._id) {
        await this.storage.getClient().delete({ id: hit._id });
      }
    }
  }

  private async getById(id: string): Promise<WatchDocument | undefined> {
    const response = await this.storage.getClient().search({
      query: { bool: { filter: [createSpaceFilter(this.space), { term: { id } }] } },
      sort: [{ updatedAt: 'desc' }],
      size: 1,
      terminate_after: 1,
      track_total_hits: false,
    });
    const hit = response.hits.hits[0];
    return hit ? ({ _id: hit._id!, _source: hit._source } as WatchDocument) : undefined;
  }
}

export const createWatchClient = ({
  space,
  logger,
  esClient,
}: {
  space: string;
  logger: Logger;
  esClient: ElasticsearchClient;
}): WatchClient => new WatchClientImpl(space, logger, esClient);
