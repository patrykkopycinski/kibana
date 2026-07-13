/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalProperties } from '../client/proposals/types';

/**
 * Resolve the source alert document id for post-dismiss FP tagging.
 * Worker-created proposals use alert id as proposal id; demo seeds may only
 * encode it in hypothesis/title.
 */
export const resolveProposalAlertId = (proposal: ProposalProperties): string | undefined => {
  if (proposal.id.startsWith('alert-')) {
    return proposal.id;
  }
  const hypothesisMatch = proposal.hypothesis?.match(/^Alert ([\w-]+) triaged/);
  if (hypothesisMatch) {
    return hypothesisMatch[1];
  }
  const titleMatch = proposal.title?.match(/ on (alert-[\w-]+)$/);
  if (titleMatch) {
    return titleMatch[1];
  }
  return undefined;
};
