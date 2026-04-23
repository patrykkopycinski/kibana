/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Lifecycle state of a Caldera attack command. The dispatcher workflow
 * transitions pending → claimed → completed (or failed). We keep the set
 * closed so the table always gets a typed badge color.
 */
export type ArgusCalderaCommandStatus =
  | 'pending'
  | 'claimed'
  | 'running'
  | 'completed'
  | 'failed'
  | 'unknown';

export interface ArgusCalderaCommand {
  readonly id: string;
  readonly timestamp: string;
  readonly status: ArgusCalderaCommandStatus;
  readonly difficulty?: number;
  readonly profile?: string;
  readonly operation_profile?: string;
  readonly source?: string;
  readonly techniques?: readonly string[];
  readonly correlation_id?: string;
  readonly claimed_at?: string;
  readonly claimed_by?: string;
  readonly dispatched_at?: string;
  readonly completed_at?: string;
  readonly operation_id?: string;
  readonly caldera_operation_id?: string;
  readonly caldera_adversary_id?: string;
  readonly caldera_state?: string;
  readonly techniques_executed?: readonly string[];
  readonly error?: string;
}

export interface ArgusCalderaProfile {
  readonly id: string;
  readonly difficulty_level: number;
  readonly name: string;
  readonly adversary_id?: string;
  readonly group?: string;
  readonly description?: string;
  readonly techniques: readonly string[];
  readonly source_file?: string;
  readonly seeded_at?: string;
}

export interface ArgusCalderaDifficultyState {
  readonly timestamp?: string;
  readonly current_level?: number;
  readonly level?: number;
  readonly level_name?: string;
  readonly previous_level?: number;
  readonly detection_rate_pct?: number;
  readonly fp_rate_pct?: number;
  readonly total_outcomes?: number;
  readonly tp_count?: number;
  readonly fp_count?: number;
  readonly avg_triage_confidence?: number;
  readonly trusted_agent_count?: number;
  readonly decision?: string;
  /**
   * Structured reason from the producer explaining *why* the controller
   * chose this `decision`. Stable enum-ish values the UI can i18n/colour
   * on — unlike the free-form `reasoning` field which is a human string.
   *
   * Known values (emitted by `soc-difficulty-controller` v3):
   *  - `normal_escalation`        — det+fp+trust all satisfied
   *  - `strong_signal_bypass`     — det≥90% AND fp≤10% (trust was stale/missing but
   *                                  performance was overwhelming enough to escalate anyway)
   *  - `at_max_level`             — would have escalated but already at cap
   *  - `performance_degraded`     — det<50% OR fp>60%
   *  - `at_min_level`             — would have decreased but already at floor
   *  - `held_stable`              — in the mid performance band, level unchanged
   *  - `trust_stale`              — would have escalated except for trust gate; perf not strong enough for bypass
   *  - `insufficient_data`        — not enough outcomes in the lookback to decide
   */
  readonly decision_reason?: string;
  readonly reasoning?: string;
  readonly source?: string;
  /**
   * Seconds since the state document was written, computed by the builder
   * using the response clock. `undefined` if the timestamp couldn't be
   * parsed. The UI uses this to warn when the controller has gone quiet
   * (cadence is 15 min; >1800s = stale).
   */
  readonly age_seconds?: number;
  /**
   * Convenience flag: `age_seconds > 1800`. Materialised in the builder so
   * every consumer (panel, dashboard, tests) agrees on what "stale" means.
   */
  readonly stale?: boolean;
}

export interface ArgusCalderaCounts {
  readonly pending: number;
  readonly claimed: number;
  readonly running: number;
  readonly completed: number;
  readonly failed: number;
  readonly total: number;
}

export interface ArgusCalderaQueueResponse {
  readonly commands: readonly ArgusCalderaCommand[];
  readonly profiles: readonly ArgusCalderaProfile[];
  readonly difficulty_state?: ArgusCalderaDifficultyState;
  readonly counts: ArgusCalderaCounts;
  readonly truncated: boolean;
}
