/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const ALL_AGENTS_GROUP_KEY = 'All agents';

export const useAgentGroups = () => {
  // TODO: make this populated by ES queries
  return {
    [ALL_AGENTS_GROUP_KEY]: 'all_agents',
    platforms: {
      MacOS: 'darwin',
      Windows: 'windows',
      Linux: 'linux',
    },
    policies: {},
  };
};
