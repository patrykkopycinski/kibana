/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { randomUUID } from 'crypto';
import type { Logger, ElasticsearchClient } from '@kbn/core/server';
import type { EvidenceStorage, EvidenceProperties } from './storage';
import { createEvidenceStorage } from './storage';
import type { EvidenceDocument } from './types';
import { EvidenceNotFoundError } from './errors';

export { EvidenceNotFoundError };

const MAX_EVIDENCE_PER_SPACE = 1000;

/**
 * Client for the Daybreak evidence store module.
 */
export interface EvidenceClient {
  /** Get a single evidence by ID (scoped to current space). */
  get(id: string): Promise<EvidenceProperties>;
  /** Search/list evidence documents, optionally filtered by kind or stance. */
  list(filters?: EvidenceListFilters): Promise<EvidenceProperties[]>;
  /** Create a new evidence document. */
  create(evidence: EvidenceCreateParams): Promise<EvidenceProperties>;
  /** Update an existing evidence document by ID. */
  update(id: string, updates: Partial<EvidenceProperties>): Promise<EvidenceProperties>;
  /** Delete an evidence document by ID. */
  delete(id: string): Promise<boolean>;
}

export interface EvidenceListFilters {
  kind?: EvidenceProperties['kind'];
  stance?: EvidenceProperties['stance'];
  provenance?: EvidenceProperties['provenance'];
}

export interface EvidenceCreateParams {
  id?: string;
  kind: EvidenceProperties['kind'];
  summary: string;
  provenance: EvidenceProperties['provenance'];
  confidence: number;
  stance: EvidenceProperties['stance'];
  sourceRef?: string;
  limitations?: string[];
  sensitivityLabel: EvidenceProperties['sensitivityLabel'];
}

const createSpaceFilter = (space: string) => ({ term: { space } });

class EvidenceClientImpl implements EvidenceClient {
  private readonly space: string;
  private readonly storage: EvidenceStorage;
  private readonly logger: Logger;

  constructor({
    space,
    storage,
    logger,
  }: {
    space: string;
    storage: EvidenceStorage;
    logger: Logger;
  }) {
    this.space = space;
    this.storage = storage;
    this.logger = logger;
  }

  async get(id: string): Promise<EvidenceProperties> {
    const document = await this.getById(id);
    if (!document) {
      throw new EvidenceNotFoundError(id);
    }
    return document._source!;
  }

  async list(filters: EvidenceListFilters = {}): Promise<EvidenceProperties[]> {
    const filterClauses: Array<Record<string, unknown>> = [createSpaceFilter(this.space)];
    if (filters.kind) {
      filterClauses.push({ term: { kind: filters.kind } });
    }
    if (filters.stance) {
      filterClauses.push({ term: { stance: filters.stance } });
    }
    if (filters.provenance) {
      filterClauses.push({ term: { provenance: filters.provenance } });
    }

    const response = await this.storage.getClient().search({
      query: {
        bool: {
          filter: filterClauses,
        },
      },
      size: MAX_EVIDENCE_PER_SPACE,
      track_total_hits: true,
    });

    const total =
      typeof response.hits.total === 'number'
        ? response.hits.total
        : response.hits.total?.value ?? 0;

    if (total > MAX_EVIDENCE_PER_SPACE) {
      this.logger.warn(
        `Space "${this.space}" has ${total} evidence documents which exceeds the limit of ${MAX_EVIDENCE_PER_SPACE}. Results are truncated.`
      );
    }

    return response.hits.hits.map((hit) => (hit._source as EvidenceProperties) ?? undefined!);
  }

  async create(params: EvidenceCreateParams): Promise<EvidenceProperties> {
    const id = params.id ?? randomUUID();
    const document: EvidenceProperties = {
      id,
      kind: params.kind,
      summary: params.summary,
      provenance: params.provenance,
      confidence: params.confidence,
      stance: params.stance,
      sourceRef: params.sourceRef,
      limitations: params.limitations,
      sensitivityLabel: params.sensitivityLabel,
      createdAt: new Date().toISOString(),
      space: this.space,
    };

    await this.storage.getClient().index({
      document,
    });

    return this.get(id);
  }

  async update(id: string, updates: Partial<EvidenceProperties>): Promise<EvidenceProperties> {
    const document = await this.getById(id);
    if (!document) {
      throw new EvidenceNotFoundError(id);
    }

    const updatedSource: EvidenceProperties = {
      ...document._source!,
      ...updates,
      id: document._source!.id,
    };

    await this.storage.getClient().index({
      id: document._id,
      document: updatedSource,
    });

    return updatedSource;
  }

  async delete(id: string): Promise<boolean> {
    const document = await this.getById(id);
    if (!document) {
      return false;
    }
    const result = await this.storage.getClient().delete({ id: document._id });
    return result.result === 'deleted';
  }

  private async getById(id: string): Promise<EvidenceDocument | undefined> {
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
    return { _id: hit._id!, _source: hit._source } as EvidenceDocument;
  }
}

/** Create an evidence client bound to a given space. */
export const createEvidenceClient = ({
  space,
  logger,
  esClient,
}: {
  space: string;
  logger: Logger;
  esClient: ElasticsearchClient;
}): EvidenceClient => {
  const storage = createEvidenceStorage({ logger, esClient });
  return new EvidenceClientImpl({ space, storage, logger });
};
