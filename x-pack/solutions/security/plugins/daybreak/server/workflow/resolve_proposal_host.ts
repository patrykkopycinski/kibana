/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalProperties } from "../client/proposals/types";
import type { InvestigationProperties } from "../common/schemas/investigation";

const HOST_CAPTURE_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'for',
  'in',
  'is',
  'on',
  'or',
  'the',
  'to',
  'with',
]);

const isPlausibleHostName = (name: string): boolean =>
  name.length >= 3 && !HOST_CAPTURE_STOPWORDS.has(name.toLowerCase());

export interface ResolveProposalHostParams {
  proposal: ProposalProperties;
  explicitHostName?: string;
  investigations?: InvestigationProperties[];
}

/** Resolve the target hostname for a proposal response action. */
export const resolveProposalHostName = ({
  proposal,
  explicitHostName,
  investigations = [],
}: ResolveProposalHostParams): string | undefined => {
  const trimmed = explicitHostName?.trim();
  if (trimmed) {
    return trimmed;
  }

  const linkedInvestigation = investigations.find(
    (investigation) => investigation.sourceProposalId === proposal.id
  );
  const hostEntity = linkedInvestigation?.entities.find((entity) => entity.type === "host");
  if (hostEntity?.name) {
    return hostEntity.name;
  }

  const recommendation = proposal.recommendation ?? "";
  const finWsMatch = recommendation.match(/\b(FIN-WS-\d+)\b/i);
  if (finWsMatch) {
    return finWsMatch[1];
  }

  const hostPhraseMatch = recommendation.match(/\bhost\s+([A-Za-z0-9][A-Za-z0-9._-]+)/i);
  if (hostPhraseMatch && isPlausibleHostName(hostPhraseMatch[1])) {
    return hostPhraseMatch[1];
  }

  return undefined;
};
