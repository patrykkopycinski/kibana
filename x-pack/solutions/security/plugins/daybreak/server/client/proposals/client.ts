/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger, ElasticsearchClient } from '@kbn/core/server';
import type { ProposalStorage } from './storage';
import type { ProposalProperties, ProposalStatus, ProposalDocument } from './types';
import { createProposalsStorage } from './storage';
import { requireReadinessGate } from './gate';
import { ProposalNotFoundError } from './errors';

export { ProposalNotFoundError };

const MAX_PROPOSALS_PER_SPACE = 1000;

/**
 * Client for the Daybreak proposal store module (FR-004).
 */
export interface ProposalClient {
  /** Get a single proposal by ID (scoped to current space). */
  get(id: string): Promise<ProposalProperties>;
  /** Search/list proposals, optionally filtered by status or severity. */
  list(filters?: ProposalListFilters): Promise<ProposalProperties[]>;
  /** Create a new proposal document. */
  create(proposal: ProposalCreateParams): Promise<ProposalProperties>;
  /** Update an existing proposal document by ID. */
  update(id: string, updates: Partial<ProposalProperties>): Promise<ProposalProperties>;
  /** Delete a proposal document by ID. */
  delete(id: string): Promise<boolean>;
  /** Transition a proposal's status, applying the readiness gate (FR-005). */
  transitionStatus(id: string, targetStatus: ProposalStatus): Promise<ProposalProperties>;
  /** Add an evidence reference to a proposal. */
  addEvidenceRef(id: string, evidenceId: string): Promise<ProposalProperties>;
  /** Remove an evidence reference from a proposal. */
  removeEvidenceRef(id: string, evidenceId: string): Promise<ProposalProperties>;
}

export interface ProposalListFilters {
  status?: ProposalProperties['status'];
  severity?: ProposalProperties['severity'];
  capability?: string;
}

export interface ProposalCreateParams {
  id: string;
  title: string;
  sourceWatch?: string;
  capability: string;
  severity: ProposalProperties['severity'];
  confidence: number;
  status: ProposalStatus;
  owner?: string;
  recommendation?: string;
  evidenceRefs?: string[];
  expectedImpact?: string;
  riskCaveats?: string[];
  approvalRequirement?: ProposalProperties['approvalRequirement'];
  hypothesis?: string;
}

const createSpaceFilter = (space: string) => ({ term: { space } });

class ProposalClientImpl implements ProposalClient {
  private readonly space: string;
  private readonly storage: ProposalStorage;
  private readonly logger: Logger;

  constructor({
    space,
    storage,
    logger,
  }: {
    space: string;
    storage: ProposalStorage;
    logger: Logger;
  }) {
    this.space = space;
    this.storage = storage;
    this.logger = logger;
  }

  async get(id: string): Promise<ProposalProperties> {
    const document = await this.getById(id);
    if (!document) {
      throw new ProposalNotFoundError(id);
    }
    return document._source!;
  }

  async list(filters: ProposalListFilters = {}): Promise<ProposalProperties[]> {
    const filterClauses: Array<Record<string, unknown>> = [createSpaceFilter(this.space)];
    if (filters.status) {
      filterClauses.push({ term: { status: filters.status } });
    }
    if (filters.severity) {
      filterClauses.push({ term: { severity: filters.severity } });
    }
    if (filters.capability) {
      filterClauses.push({ term: { capability: filters.capability } });
    }

    const response = await this.storage.getClient().search({
      query: {
        bool: {
          filter: filterClauses,
        },
      },
      size: MAX_PROPOSALS_PER_SPACE,
      track_total_hits: true,
    });

    const total =
      typeof response.hits.total === 'number'
        ? response.hits.total
        : response.hits.total?.value ?? 0;

    if (total > MAX_PROPOSALS_PER_SPACE) {
      this.logger.warn(
        `Space "${this.space}" has ${total} proposals which exceeds the limit of ${MAX_PROPOSALS_PER_SPACE}. Results are truncated.`
      );
    }

    return response.hits.hits.map((hit) => (hit._source as ProposalProperties) ?? undefined!);
  }

  async create(params: ProposalCreateParams): Promise<ProposalProperties> {
    const document: ProposalProperties = {
      id: params.id,
      title: params.title,
      sourceWatch: params.sourceWatch,
      capability: params.capability,
      severity: params.severity,
      confidence: params.confidence,
      status: params.status,
      owner: params.owner,
      recommendation: params.recommendation,
      evidenceRefs: params.evidenceRefs ?? [],
      expectedImpact: params.expectedImpact,
      riskCaveats: params.riskCaveats,
      approvalRequirement: params.approvalRequirement,
      hypothesis: params.hypothesis,
      decisionHistory: [],
      createdAt: new Date().toISOString(),
      space: this.space,
    };

    await this.storage.getClient().index({
      document,
    });

    return this.get(params.id);
  }

  async update(id: string, updates: Partial<ProposalProperties>): Promise<ProposalProperties> {
    const document = await this.getById(id);
    if (!document) {
      throw new ProposalNotFoundError(id);
    }

    const updatedSource: ProposalProperties = {
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

  async transitionStatus(id: string, targetStatus: ProposalStatus): Promise<ProposalProperties> {
    const document = await this.getById(id);
    if (!document) {
      throw new ProposalNotFoundError(id);
    }

    const current = document._source!;
    requireReadinessGate(current, targetStatus);

    const updatedSource: ProposalProperties = {
      ...current,
      status: targetStatus,
      decisionHistory: [
        ...current.decisionHistory,
        {
          fromStatus: current.status,
          toStatus: targetStatus,
          timestamp: new Date().toISOString(),
        },
      ],
    };

    await this.storage.getClient().index({
      id: document._id,
      document: updatedSource,
    });

    return updatedSource;
  }

  async addEvidenceRef(id: string, evidenceId: string): Promise<ProposalProperties> {
    const document = await this.getById(id);
    if (!document) {
      throw new ProposalNotFoundError(id);
    }

    const current = document._source!;
    if (current.evidenceRefs.includes(evidenceId)) {
      return current;
    }

    const updatedSource: ProposalProperties = {
      ...current,
      evidenceRefs: [...current.evidenceRefs, evidenceId],
    };

    await this.storage.getClient().index({
      id: document._id,
      document: updatedSource,
    });

    return updatedSource;
  }

  async removeEvidenceRef(id: string, evidenceId: string): Promise<ProposalProperties> {
    const document = await this.getById(id);
    if (!document) {
      throw new ProposalNotFoundError(id);
    }

    const current = document._source!;
    const updatedSource: ProposalProperties = {
      ...current,
      evidenceRefs: current.evidenceRefs.filter((ref) => ref !== evidenceId),
    };

    await this.storage.getClient().index({
      id: document._id,
      document: updatedSource,
    });

    return updatedSource;
  }

  private async getById(id: string): Promise<ProposalDocument | undefined> {
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
    return { _id: hit._id!, _source: hit._source } as ProposalDocument;
  }
}

/** Create a proposal client bound to a given space. */
export const createProposalClient = ({
  space,
  logger,
  esClient,
}: {
  space: string;
  logger: Logger;
  esClient: ElasticsearchClient;
}): ProposalClient => {
  const storage = createProposalsStorage({ logger, esClient });
  return new ProposalClientImpl({ space, storage, logger });
};
