/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ArgusCoverageCounts,
  ArgusCoverageGap,
  ArgusCoverageResponse,
  ArgusCoverageSeverity,
} from '../types/coverage_gaps';

export interface RawCoverageGapDoc {
  readonly '@timestamp'?: unknown;
  readonly technique_id?: unknown;
  readonly technique_name?: unknown;
  readonly occurrences?: unknown;
  readonly avg_confidence?: unknown;
  readonly source?: unknown;
}

export interface RawCoverageHit {
  readonly doc_id: string;
  readonly source: RawCoverageGapDoc;
}

export interface BuildCoverageGapsArgs {
  readonly hits: readonly RawCoverageHit[];
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly limit?: number;
}

const DEFAULT_LIMIT = 100;
const HARD_CAP = 500;

export const buildCoverageGaps = ({
  hits,
  windowStart,
  windowEnd,
  limit = DEFAULT_LIMIT,
}: BuildCoverageGapsArgs): ArgusCoverageResponse => {
  const effectiveLimit = Math.max(1, Math.min(limit, HARD_CAP));

  // Dedupe on `technique_id`. The coverage-gap index accumulates a new
  // snapshot every time the gap analyzer runs, so the same MITRE technique
  // typically appears N times with identical metrics. The ES query sorts by
  // `occurrences desc, @timestamp desc`, so the first hit we see per
  // technique is the strongest & freshest — keep it, drop the rest.
  const seenTechniques = new Set<string>();
  const gaps: ArgusCoverageGap[] = [];
  for (const hit of hits) {
    const gap = hitToGap(hit);
    if (gap && !seenTechniques.has(gap.technique_id)) {
      seenTechniques.add(gap.technique_id);
      gaps.push(gap);
    }
  }

  // Severity first, then occurrences desc. This is the order operators
  // actually want: "show me loud-and-poorly-detected before quiet-and-
  // poorly-detected". Ties on severity fall back to occurrences.
  const severityRank: Record<ArgusCoverageSeverity, number> = {
    critical: 0,
    high: 1,
    moderate: 2,
    low: 3,
  };
  gaps.sort((a, b) => {
    const diff = severityRank[a.severity] - severityRank[b.severity];
    if (diff !== 0) return diff;
    return b.occurrences - a.occurrences;
  });

  const counts = countBySeverity(gaps);
  const truncated = gaps.length > effectiveLimit;
  const visible = truncated ? gaps.slice(0, effectiveLimit) : gaps;

  return {
    window_start: windowStart,
    window_end: windowEnd,
    gaps: visible,
    counts,
    truncated,
  };
};

export const hitToGap = ({ doc_id: docId, source }: RawCoverageHit): ArgusCoverageGap | null => {
  const techniqueId = readString(source.technique_id);
  if (!techniqueId) return null;

  const occurrences = readFiniteNumber(source.occurrences) ?? 0;
  const avgConfidence = readFiniteNumber(source.avg_confidence) ?? 0;

  return {
    id: docId,
    technique_id: techniqueId,
    technique_name: readString(source.technique_name),
    timestamp: readString(source['@timestamp']),
    occurrences,
    avg_confidence: avgConfidence,
    severity: classifySeverity(occurrences, avgConfidence),
    source: readString(source.source),
  };
};

/**
 * Severity classifier. Two axes drive the bucket — how loud the gap is
 * (occurrences) and how confident the existing detections were (lower =
 * worse). The thresholds are tuned for the demo cluster and documented
 * inline so it's obvious what to move when the distribution shifts.
 */
const classifySeverity = (occurrences: number, avgConfidence: number): ArgusCoverageSeverity => {
  // Hot, low-confidence — definitely needs attention first.
  if (occurrences >= 50 && avgConfidence < 0.4) return 'critical';
  // Hot, moderate confidence OR quiet, low confidence — second tier.
  if (occurrences >= 20 && avgConfidence < 0.6) return 'high';
  if (occurrences >= 5 && avgConfidence < 0.8) return 'moderate';
  return 'low';
};

const countBySeverity = (gaps: readonly ArgusCoverageGap[]): ArgusCoverageCounts => {
  const counts = { total: gaps.length, critical: 0, high: 0, moderate: 0, low: 0 };
  for (const g of gaps) {
    counts[g.severity] += 1;
  }
  return counts;
};

const readString = (value: unknown): string | undefined => {
  if (value == null) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
};

const readFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};
