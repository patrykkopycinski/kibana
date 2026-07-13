/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger, ElasticsearchClient } from '@kbn/core/server';
import type { InvestigationStorage } from './storage';
import type { InvestigationDocument, InvestigationProperties } from './types';
import { createInvestigationsStorage } from './storage';

export interface InvestigationClient {
  get(id: string): Promise<InvestigationProperties>;
  list(): Promise<InvestigationProperties[]>;
  create(investigation: InvestigationProperties): Promise<InvestigationProperties>;
  update(id: string, updates: Partial<InvestigationProperties>): Promise<InvestigationProperties>;
  delete(id: string): Promise<boolean>;
}

const MAX_INVESTIGATIONS_PER_SPACE = 1000;

const createSpaceFilter = (space: string) => ({ term: { space } });

class InvestigationClientImpl implements InvestigationClient {
  private readonly space: string;
  private readonly storage: InvestigationStorage;
  private readonly logger: Logger;

  constructor({
    space,
    storage,
    logger,
  }: {
    space: string;
    storage: InvestigationStorage;
    logger: Logger;
  }) {
    this.space = space;
    this.storage = storage;
    this.logger = logger;
  }

  async get(id: string): Promise<InvestigationProperties> {
    const document = await this.getById(id);
    if (!document) {
      throw new Error(`Investigation not found: ${id}`);
    }
    return document._source!;
  }

  async list(): Promise<InvestigationProperties[]> {
    const response = await this.storage.getClient().search({
      query: {
        bool: {
          filter: [createSpaceFilter(this.space)],
        },
      },
      size: MAX_INVESTIGATIONS_PER_SPACE,
      track_total_hits: true,
    });

    const total =
      typeof response.hits.total === 'number'
        ? response.hits.total
        : response.hits.total?.value ?? 0;

    if (total > MAX_INVESTIGATIONS_PER_SPACE) {
      this.logger.warn(
        `Space "${this.space}" has ${total} investigations which exceeds the limit of ${MAX_INVESTIGATIONS_PER_SPACE}. Results are truncated.`
      );
    }

    return response.hits.hits.map((hit) => (hit._source as InvestigationProperties) ?? undefined!);
  }

  async create(investigation: InvestigationProperties): Promise<InvestigationProperties> {
    await this.deleteAllById(investigation.id);
    await this.storage.getClient().index({
      id: investigation.id,
      document: { ...investigation, space: this.space },
    });
    return this.get(investigation.id);
  }

  async update(
    id: string,
    updates: Partial<InvestigationProperties>
  ): Promise<InvestigationProperties> {
    const document = await this.getById(id);
    if (!document) {
      throw new Error(`Investigation not found: ${id}`);
    }

    const updatedSource: InvestigationProperties = {
      ...document._source!,
      ...updates,
      id: document._source!.id,
      updatedAt: new Date().toISOString(),
    };

    await this.deleteAllById(id);
    await this.storage.getClient().index({
      id,
      document: updatedSource,
    });

    return this.get(id);
  }

  async delete(id: string): Promise<boolean> {
    const document = await this.getById(id);
    if (!document) {
      return false;
    }
    const result = await this.storage.getClient().delete({ id: document._id });
    return result.result === 'deleted';
  }

  private async getById(id: string): Promise<InvestigationDocument | undefined> {
    const response = await this.storage.getClient().search({
      track_total_hits: false,
      size: 1,
      terminate_after: 1,
      sort: [{ createdAt: 'desc' }],
      query: {
        bool: {
          filter: [createSpaceFilter(this.space), { term: { id } }],
        },
      },
    });
    const hit = response.hits.hits[0];
    if (!hit) {
      return undefined;
    }
    return { _id: hit._id!, _source: hit._source } as InvestigationDocument;
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
      this.logger.warn(
        `More than 100 duplicate documents found for investigation ${id}; truncating cleanup.`
      );
    }
    for (const hit of response.hits.hits) {
      if (hit._id) {
        await this.storage.getClient().delete({ id: hit._id });
      }
    }
  }
}

export const createInvestigationClient = ({
  space,
  logger,
  esClient,
}: {
  space: string;
  logger: Logger;
  esClient: ElasticsearchClient;
}): InvestigationClient => {
  const storage = createInvestigationsStorage({ logger, esClient });
  return new InvestigationClientImpl({ space, storage, logger });
};
