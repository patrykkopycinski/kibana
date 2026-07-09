/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** Thrown when an evidence document cannot be found for the current space. */
export class EvidenceNotFoundError extends Error {
  constructor(public readonly evidenceId: string) {
    super(`Evidence with id '${evidenceId}' not found`);
    this.name = 'EvidenceNotFoundError';
  }
}
