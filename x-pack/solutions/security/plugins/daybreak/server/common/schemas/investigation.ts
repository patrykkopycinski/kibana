/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { GetResponse } from '@elastic/elasticsearch/lib/api/types';

/** Status values for a Daybreak Investigation. */
export type InvestigationStatus = 'open' | 'closed' | 'escalated';

/** A single timeline entry in an Investigation. */
export interface TimelineEntry {
  timestamp: string;
  description: string;
  evidenceRef?: string;
}

/** An entity of interest surfaced during investigation. */
export interface InvestigationEntity {
  id: string;
  name: string;
  type: 'host' | 'user' | 'ip' | 'process' | 'file' | 'other';
  relevance: 'primary' | 'secondary' | 'contextual';
}

/** A hypothesis tracked in an Investigation. */
export interface InvestigationHypothesis {
  id: string;
  statement: string;
  confidence: number;
  status: 'untested' | 'supported' | 'contradicted' | 'inconclusive';
}

/** Spike-owned Investigation document. */
export interface InvestigationProperties {
  schemaVersion?: string;
  id: string;
  title: string;
  summary: string;
  sourceProposalId: string;
  sourceWatch?: string;
  sourceWorkerId?: string;
  capability: string;
  status: InvestigationStatus;
  hypotheses: InvestigationHypothesis[];
  evidenceRefs: string[];
  timeline: TimelineEntry[];
  entities: InvestigationEntity[];
  openQuestions: string[];
  decisions?: string[];
  createdAt: string;
  updatedAt: string;
  space?: string;
}

/** Investigation document as returned by ES. */
export type InvestigationDocument = Pick<GetResponse<InvestigationProperties>, '_source' | '_id'>;
