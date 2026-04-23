/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ArgusCalderaCommand,
  ArgusCalderaCommandStatus,
  ArgusCalderaCounts,
  ArgusCalderaDifficultyState,
  ArgusCalderaProfile,
  ArgusCalderaQueueResponse,
} from '../types/caldera_queue';

export interface RawCalderaCommandDoc {
  readonly '@timestamp'?: unknown;
  readonly status?: unknown;
  readonly difficulty?: unknown;
  readonly profile?: unknown;
  readonly operation_profile?: unknown;
  readonly source?: unknown;
  readonly techniques?: unknown;
  readonly correlation_id?: unknown;
  readonly claimed_at?: unknown;
  readonly claimed_by?: unknown;
  readonly dispatched_at?: unknown;
  readonly completed_at?: unknown;
  readonly operation_id?: unknown;
  readonly caldera_operation_id?: unknown;
  readonly caldera_adversary_id?: unknown;
  readonly caldera_state?: unknown;
  readonly techniques_executed?: unknown;
  readonly error?: unknown;
}

export interface RawCalderaProfileDoc {
  readonly difficulty_level?: unknown;
  readonly name?: unknown;
  readonly adversary_id?: unknown;
  readonly group?: unknown;
  readonly description?: unknown;
  readonly techniques?: unknown;
  readonly source_file?: unknown;
  readonly seeded_at?: unknown;
}

export interface RawDifficultyStateDoc {
  readonly '@timestamp'?: unknown;
  readonly current_level?: unknown;
  readonly level?: unknown;
  readonly level_name?: unknown;
  readonly previous_level?: unknown;
  readonly detection_rate_pct?: unknown;
  readonly fp_rate_pct?: unknown;
  readonly total_outcomes?: unknown;
  readonly tp_count?: unknown;
  readonly fp_count?: unknown;
  readonly avg_triage_confidence?: unknown;
  readonly trusted_agent_count?: unknown;
  readonly decision?: unknown;
  readonly decision_reason?: unknown;
  readonly reasoning?: unknown;
  readonly source?: unknown;
}

export interface BuildCalderaQueueArgs {
  readonly commandHits: ReadonlyArray<{
    readonly doc_id: string;
    readonly source: RawCalderaCommandDoc;
  }>;
  readonly profileHits: ReadonlyArray<{
    readonly doc_id: string;
    readonly source: RawCalderaProfileDoc;
  }>;
  readonly difficultyStateDoc?: RawDifficultyStateDoc;
  readonly limit?: number;
  /**
   * Injected clock for age calculation on the difficulty-state doc.
   * Defaults to `Date.now()`; tests pin it for deterministic assertions.
   */
  readonly nowMs?: number;
}

const DEFAULT_LIMIT = 50;
const HARD_CAP = 200;

/**
 * Controller cadence is 15 min (900 s). We flag anything older than 2×
 * cadence as "stale" — that leaves a 15-min grace window for a single
 * missed tick before we start nagging the operator.
 */
export const DIFFICULTY_STALE_AGE_SECONDS = 1800;

const STATUS_VALUES: readonly ArgusCalderaCommandStatus[] = [
  'pending',
  'claimed',
  'running',
  'completed',
  'failed',
  'unknown',
];

export const buildCalderaQueue = ({
  commandHits,
  profileHits,
  difficultyStateDoc,
  limit = DEFAULT_LIMIT,
  nowMs = Date.now(),
}: BuildCalderaQueueArgs): ArgusCalderaQueueResponse => {
  const effectiveLimit = Math.max(1, Math.min(limit, HARD_CAP));

  const commands: ArgusCalderaCommand[] = [];
  for (const hit of commandHits) {
    const cmd = buildCommand(hit.doc_id, hit.source);
    if (cmd) commands.push(cmd);
  }
  commands.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

  const profiles: ArgusCalderaProfile[] = [];
  for (const hit of profileHits) {
    const p = buildProfile(hit.doc_id, hit.source);
    if (p) profiles.push(p);
  }
  // Profiles sort by difficulty level so the UI can render "Level 1 → Level N"
  // left-to-right without a second pass.
  profiles.sort((a, b) => a.difficulty_level - b.difficulty_level);

  const counts = countByStatus(commands);
  const truncated = commands.length > effectiveLimit;
  const visibleCommands = truncated ? commands.slice(0, effectiveLimit) : commands;

  return {
    commands: visibleCommands,
    profiles,
    difficulty_state: difficultyStateDoc
      ? buildDifficultyState(difficultyStateDoc, nowMs)
      : undefined,
    counts,
    truncated,
  };
};

const buildCommand = (docId: string, source: RawCalderaCommandDoc): ArgusCalderaCommand | null => {
  const timestamp = readString(source['@timestamp']);
  if (!timestamp) return null;

  return {
    id: docId,
    timestamp,
    status: normaliseStatus(source.status),
    difficulty: readFiniteNumber(source.difficulty),
    profile: readString(source.profile),
    operation_profile: readString(source.operation_profile),
    source: readString(source.source),
    techniques: readTechniqueList(source.techniques),
    correlation_id: readString(source.correlation_id),
    claimed_at: readString(source.claimed_at),
    claimed_by: readString(source.claimed_by),
    dispatched_at: readString(source.dispatched_at),
    completed_at: readString(source.completed_at),
    operation_id: readString(source.operation_id),
    caldera_operation_id: readString(source.caldera_operation_id),
    caldera_adversary_id: readString(source.caldera_adversary_id),
    caldera_state: readString(source.caldera_state),
    techniques_executed: readTechniqueList(source.techniques_executed),
    error: readString(source.error),
  };
};

/**
 * `techniques_executed` is emitted by the Caldera dispatcher either as an
 * array (`["T1033","T1059.004"]`) OR as a delimiter-less concatenation
 * (`"T1033T1059.004T1496"`). The concat form is a producer bug we don't
 * control, so we defensively parse both shapes here into a normalised
 * array instead of forcing the UI to special-case it.
 */
const TECHNIQUE_PATTERN = /T\d+(?:\.\d+)*/g;

const readTechniqueList = (value: unknown): readonly string[] | undefined => {
  if (Array.isArray(value)) return readStringArray(value);
  if (typeof value === 'string') {
    const matches = value.match(TECHNIQUE_PATTERN);
    if (matches && matches.length > 0) return matches;
    const trimmed = value.trim();
    return trimmed.length > 0 ? [trimmed] : undefined;
  }
  return undefined;
};

const buildProfile = (docId: string, source: RawCalderaProfileDoc): ArgusCalderaProfile | null => {
  const name = readString(source.name);
  const level = readFiniteNumber(source.difficulty_level);
  if (!name || level === undefined) return null;

  return {
    id: docId,
    difficulty_level: level,
    name,
    adversary_id: readString(source.adversary_id),
    group: readString(source.group),
    description: readString(source.description),
    techniques: readStringArray(source.techniques) ?? [],
    source_file: readString(source.source_file),
    seeded_at: readString(source.seeded_at),
  };
};

const buildDifficultyState = (
  source: RawDifficultyStateDoc,
  nowMs: number
): ArgusCalderaDifficultyState => {
  const timestamp = readString(source['@timestamp']);
  const ageSeconds = computeAgeSeconds(timestamp, nowMs);

  return {
    timestamp,
    current_level: readFiniteNumber(source.current_level),
    level: readFiniteNumber(source.level),
    level_name: readString(source.level_name),
    previous_level: readFiniteNumber(source.previous_level),
    detection_rate_pct: readFiniteNumber(source.detection_rate_pct),
    fp_rate_pct: readFiniteNumber(source.fp_rate_pct),
    total_outcomes: readFiniteNumber(source.total_outcomes),
    tp_count: readFiniteNumber(source.tp_count),
    fp_count: readFiniteNumber(source.fp_count),
    avg_triage_confidence: readFiniteNumber(source.avg_triage_confidence),
    trusted_agent_count: readFiniteNumber(source.trusted_agent_count),
    decision: readString(source.decision),
    decision_reason: readString(source.decision_reason),
    reasoning: readString(source.reasoning),
    source: readString(source.source),
    age_seconds: ageSeconds,
    stale: ageSeconds !== undefined && ageSeconds > DIFFICULTY_STALE_AGE_SECONDS,
  };
};

const computeAgeSeconds = (timestamp: string | undefined, nowMs: number): number | undefined => {
  if (!timestamp) return undefined;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return undefined;
  // Clamp negatives to 0 — a timestamp in the future is a clock-skew anomaly
  // but surfacing a negative age to the UI would be worse than flooring.
  return Math.max(0, Math.round((nowMs - parsed) / 1000));
};

const countByStatus = (commands: readonly ArgusCalderaCommand[]): ArgusCalderaCounts => {
  const counts = {
    pending: 0,
    claimed: 0,
    running: 0,
    completed: 0,
    failed: 0,
    total: commands.length,
  };
  for (const cmd of commands) {
    switch (cmd.status) {
      case 'pending':
        counts.pending += 1;
        break;
      case 'claimed':
        counts.claimed += 1;
        break;
      case 'running':
        counts.running += 1;
        break;
      case 'completed':
        counts.completed += 1;
        break;
      case 'failed':
        counts.failed += 1;
        break;
      case 'unknown':
        break;
    }
  }
  return counts;
};

const normaliseStatus = (value: unknown): ArgusCalderaCommandStatus => {
  const s = readString(value)?.toLowerCase();
  if (!s) return 'unknown';
  return (STATUS_VALUES as readonly string[]).includes(s)
    ? (s as ArgusCalderaCommandStatus)
    : 'unknown';
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

const readStringArray = (value: unknown): readonly string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const item of value) {
    const s = readString(item);
    if (s) out.push(s);
  }
  return out.length > 0 ? out : undefined;
};
