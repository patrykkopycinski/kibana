/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** Thrown when a proposal document cannot be found for the current space. */
export class ProposalNotFoundError extends Error {
  constructor(public readonly proposalId: string) {
    super(`Proposal with id '${proposalId}' not found`);
    this.name = 'ProposalNotFoundError';
  }
}
