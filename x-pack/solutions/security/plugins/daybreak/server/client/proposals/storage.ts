/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger, ElasticsearchClient } from '@kbn/core/server';
import type { IndexStorageSettings } from '@kbn/storage-adapter';
import { StorageIndexAdapter, types } from '@kbn/storage-adapter';
import type { ProposalProperties } from './types';

/**
 * Index name for the Daybreak proposal store. Prefixed with `.kibana-` (not
 * just `.daybreak-`) so it falls under the `.kibana*` index pattern already
 * granted to the `kibana_system` role (see `KibanaOwnedReservedRoleDescriptors
 * .kibanaSystem` in Elasticsearch) — matching the convention used by other
 * Kibana-owned `StorageIndexAdapter` indices (e.g.
 * `.kibana-automatic-import-samples`, `.kibana-anonymization-profiles`).
 * A bare `.daybreak-*` index would need its own Elasticsearch-side role grant.
 */
export const proposalIndexName = '.kibana-daybreak-proposals';

const storageSettings = {
  name: proposalIndexName,
  schema: {
    properties: {
      id: types.keyword({}),
      title: types.text({}),
      sourceWatch: types.keyword({}),
      capability: types.keyword({}),
      severity: types.keyword({}),
      confidence: types.float({}),
      status: types.keyword({}),
      owner: types.keyword({}),
      createdAt: types.date({}),
      recommendation: types.text({}),
      evidenceRefs: types.keyword({}),
      expectedImpact: types.text({}),
      riskCaveats: types.keyword({}),
      approvalRequirement: types.keyword({}),
      decisionHistory: types.nested({
        properties: {
          fromStatus: types.keyword({}),
          toStatus: types.keyword({}),
          actor: types.keyword({}),
          reason: types.text({}),
          timestamp: types.date({}),
        },
      }),
      space: types.keyword({}),
    },
  },
} satisfies IndexStorageSettings;

export type ProposalStorageSettings = typeof storageSettings;

/** Storage adapter type for proposals. */
export type ProposalStorage = StorageIndexAdapter<ProposalStorageSettings, ProposalProperties>;

/** Create the proposal storage layer. */
export const createProposalsStorage = ({
  logger,
  esClient,
}: {
  logger: Logger;
  esClient: ElasticsearchClient;
}): ProposalStorage => {
  return new StorageIndexAdapter<ProposalStorageSettings, ProposalProperties>(
    esClient,
    logger,
    storageSettings
  );
};
