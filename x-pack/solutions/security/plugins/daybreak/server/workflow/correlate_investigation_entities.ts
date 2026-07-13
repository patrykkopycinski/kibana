/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProposalProperties } from '../client/proposals/types';
import type { InvestigationProperties } from '../common/schemas/investigation';

export type CorrelationEntityType = 'host' | 'user';

export interface CorrelationEntity {
  type: CorrelationEntityType;
  name: string;
}

const FIN_WS_HOST_PATTERN = /\b(FIN-WS-\d+)\b/gi;
const HOST_PHRASE_PATTERN = /\bhost(?:name)?[:\s]+([A-Za-z0-9][A-Za-z0-9._-]+)/gi;
const USER_PHRASE_PATTERN = /\buser(?:name)?[:\s]+([A-Za-z0-9][A-Za-z0-9._@.-]+)/gi;

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

const normalizeExtractedName = (name: string) => name.replace(/[.,;:!?]+$/g, '');

const isPlausibleHostName = (name: string): boolean => {
  const normalized = normalizeExtractedName(name);
  return normalized.length >= 3 && !HOST_CAPTURE_STOPWORDS.has(normalized.toLowerCase());
};

const addEntity = (
  entities: CorrelationEntity[],
  seen: Set<string>,
  type: CorrelationEntityType,
  name: string
) => {
  const normalized = normalizeExtractedName(name);
  const key = `${type}:${normalized.toLowerCase()}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  entities.push({ type, name: normalized });
};

/** Extract host/user correlation entities from free text. */
export const extractCorrelationEntitiesFromText = (text: string): CorrelationEntity[] => {
  const entities: CorrelationEntity[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(FIN_WS_HOST_PATTERN)) {
    addEntity(entities, seen, 'host', match[1]);
  }
  for (const match of text.matchAll(HOST_PHRASE_PATTERN)) {
    if (isPlausibleHostName(match[1])) {
      addEntity(entities, seen, 'host', match[1]);
    }
  }
  for (const match of text.matchAll(USER_PHRASE_PATTERN)) {
    addEntity(entities, seen, 'user', match[1]);
  }

  return entities;
};

/** Extract host/user entities from a proposal document. */
export const extractCorrelationEntitiesFromProposal = (
  proposal: ProposalProperties
): CorrelationEntity[] => {
  const text = [proposal.title, proposal.recommendation, proposal.hypothesis]
    .filter((value): value is string => Boolean(value))
    .join(' ');
  return extractCorrelationEntitiesFromText(text);
};

/** Collect host/user entities used to correlate an investigation. */
export const getInvestigationCorrelationEntities = (
  investigation: InvestigationProperties
): CorrelationEntity[] => {
  const entities: CorrelationEntity[] = [];
  const seen = new Set<string>();

  for (const entity of investigation.entities) {
    if (entity.type === 'host' || entity.type === 'user') {
      addEntity(entities, seen, entity.type, entity.name);
    }
  }

  for (const extracted of extractCorrelationEntitiesFromText(investigation.summary)) {
    addEntity(entities, seen, extracted.type, extracted.name);
  }

  return entities;
};

/** Correlate proposals to an investigation by shared host/user entities. */
export const correlateProposalsToInvestigation = (
  investigation: InvestigationProperties,
  proposals: ProposalProperties[]
): ProposalProperties[] => {
  const correlationEntities = getInvestigationCorrelationEntities(investigation);

  if (correlationEntities.length === 0) {
    if (!investigation.sourceWatch) {
      return [];
    }
    return proposals.filter(
      (proposal) =>
        proposal.sourceWatch === investigation.sourceWatch &&
        proposal.id !== investigation.sourceProposalId
    );
  }

  return proposals.filter((proposal) => {
    if (proposal.id === investigation.sourceProposalId) {
      return false;
    }

    const proposalEntities = extractCorrelationEntitiesFromProposal(proposal);
    if (proposalEntities.length === 0) {
      return (
        Boolean(investigation.sourceWatch) && proposal.sourceWatch === investigation.sourceWatch
      );
    }

    return proposalEntities.some((proposalEntity) =>
      correlationEntities.some(
        (investigationEntity) =>
          investigationEntity.type === proposalEntity.type &&
          investigationEntity.name.toLowerCase() === proposalEntity.name.toLowerCase()
      )
    );
  });
};

/** Resolve scoped host names for forensic reconstruction. */
export const resolveInvestigationHostNames = (
  investigation: InvestigationProperties,
  sourceProposal?: ProposalProperties,
  explicitHosts?: string[]
): string[] => {
  const hosts = new Set<string>();

  for (const host of explicitHosts ?? []) {
    const trimmed = host.trim();
    if (trimmed) {
      hosts.add(trimmed);
    }
  }

  for (const entity of investigation.entities) {
    if (entity.type === 'host' && entity.name.trim()) {
      hosts.add(entity.name.trim());
    }
  }

  for (const entity of extractCorrelationEntitiesFromText(investigation.summary)) {
    if (entity.type === 'host') {
      hosts.add(entity.name);
    }
  }

  if (sourceProposal) {
    for (const entity of extractCorrelationEntitiesFromProposal(sourceProposal)) {
      if (entity.type === 'host') {
        hosts.add(entity.name);
      }
    }
  }

  return Array.from(hosts);
};
