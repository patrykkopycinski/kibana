/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export class WorkflowNotFoundError extends Error {
  constructor(id: string) {
    super(`Workflow "${id}" was not found.`);
  }
}

export const createWorkflowConflictError = (id: string): Error => {
  const error = new Error(`Workflow "${id}" already exists.`);
  error.name = 'WorkflowConflictError';
  return error;
};
