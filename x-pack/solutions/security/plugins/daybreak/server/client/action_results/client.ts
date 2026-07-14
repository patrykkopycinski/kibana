/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger, ElasticsearchClient } from '@kbn/core/server';
import type {
  ActionResultStorage,
  ActionResultProperties,
  ActionResultStoredDocument,
} from './storage';
import { createActionResultStorage } from './storage';
import type { ActionResultDocument } from './types';

export interface ActionResultClient {
  get(id: string): Promise<ActionResultProperties>;
  list(): Promise<ActionResultProperties[]>;
  create(actionResult: ActionResultProperties): Promise<ActionResultProperties>;
  listByProposalId(proposalId: string): Promise<ActionResultProperties[]>;
}

const MAX_ACTION_RESULTS_PER_SPACE = 1000;

const createSpaceFilter = (space: string) => ({ term: { space } });

const toStoredDocument = (
  actionResult: ActionResultProperties,
  space: string
): ActionResultStoredDocument => {
  const { toolResult, ...rest } = actionResult;
  return {
    ...rest,
    space,
    ...(toolResult !== undefined ? { toolResultJson: JSON.stringify(toolResult) } : {}),
  };
};

const fromStoredDocument = (stored: ActionResultStoredDocument): ActionResultProperties => {
  const { toolResultJson, ...rest } = stored;
  let toolResult: Record<string, unknown> | undefined;
  if (toolResultJson) {
    try {
      const parsed: unknown = JSON.parse(toolResultJson);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        toolResult = parsed as Record<string, unknown>;
      }
    } catch {
      toolResult = undefined;
    }
  }
  return { ...rest, ...(toolResult !== undefined ? { toolResult } : {}) };
};

class ActionResultClientImpl implements ActionResultClient {
  private readonly space: string;
  private readonly storage: ActionResultStorage;
  private readonly logger: Logger;

  constructor({
    space,
    storage,
    logger,
  }: {
    space: string;
    storage: ActionResultStorage;
    logger: Logger;
  }) {
    this.space = space;
    this.storage = storage;
    this.logger = logger;
  }

  async get(id: string): Promise<ActionResultProperties> {
    const document = await this.getById(id);
    if (!document) {
      throw new Error(`Action result not found: ${id}`);
    }
    return fromStoredDocument(document._source!);
  }

  async list(): Promise<ActionResultProperties[]> {
    return this.searchWithFilters([createSpaceFilter(this.space)]);
  }

  async listByProposalId(proposalId: string): Promise<ActionResultProperties[]> {
    return this.searchWithFilters([
      createSpaceFilter(this.space),
      { term: { proposalId } },
    ]);
  }

  async create(actionResult: ActionResultProperties): Promise<ActionResultProperties> {
    await this.storage.getClient().index({
      id: actionResult.id,
      document: toStoredDocument(actionResult, this.space),
    });
    return this.get(actionResult.id);
  }

  private async searchWithFilters(
    filterClauses: Array<Record<string, unknown>>
  ): Promise<ActionResultProperties[]> {
    const response = await this.storage.getClient().search({
      query: {
        bool: {
          filter: filterClauses,
        },
      },
      sort: [{ executedAt: { order: 'desc' } }],
      size: MAX_ACTION_RESULTS_PER_SPACE,
      track_total_hits: true,
    });

    const total =
      typeof response.hits.total === 'number'
        ? response.hits.total
        : response.hits.total?.value ?? 0;

    if (total > MAX_ACTION_RESULTS_PER_SPACE) {
      this.logger.warn(
        `Space "${this.space}" has ${total} action results which exceeds the limit of ${MAX_ACTION_RESULTS_PER_SPACE}. Results are truncated.`
      );
    }

    return response.hits.hits.map((hit) =>
      fromStoredDocument(hit._source as ActionResultStoredDocument)
    );
  }

  private async getById(id: string): Promise<ActionResultDocument | undefined> {
    const response = await this.storage.getClient().search({
      track_total_hits: false,
      size: 1,
      terminate_after: 1,
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
    return { _id: hit._id!, _source: hit._source } as ActionResultDocument;
  }
}

export const createActionResultClient = ({
  space,
  logger,
  esClient,
}: {
  space: string;
  logger: Logger;
  esClient: ElasticsearchClient;
}): ActionResultClient => {
  const storage = createActionResultStorage({ logger, esClient });
  return new ActionResultClientImpl({ space, storage, logger });
};
