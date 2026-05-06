/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export type ArgusCoverageWindow = '24h' | '7d';

/**
 * Severity bucket derived from `occurrences` and `avg_confidence` at build
 * time. `high` means many occurrences with low detection confidence — the
 * loudest signal the panel sorts on first.
 */
export type ArgusCoverageSeverity = 'low' | 'moderate' | 'high' | 'critical';

export interface ArgusCoverageGap {
  readonly id: string;
  readonly technique_id: string;
  readonly technique_name?: string;
  readonly timestamp?: string;
  readonly occurrences: number;
  readonly avg_confidence: number;
  readonly severity: ArgusCoverageSeverity;
  /**
   * Producer of the doc (`soc_gap_analyzer`, `soc_watchdog`). Used to route
   * deep-links into the right Discover saved search.
   */
  readonly source?: string;
}

export interface ArgusCoverageCounts {
  readonly total: number;
  readonly critical: number;
  readonly high: number;
  readonly moderate: number;
  readonly low: number;
}

export interface ArgusCoverageResponse {
  readonly window_start: string;
  readonly window_end: string;
  readonly gaps: readonly ArgusCoverageGap[];
  readonly counts: ArgusCoverageCounts;
  readonly truncated: boolean;
}
