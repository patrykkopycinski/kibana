/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { WatchAutonomyTier } from "../../client/watch/types";

/** Throughline UI autonomy levels 1–5 (project-daybreak CWL contract). */
export type ThroughlineAutonomyLevel = 1 | 2 | 3 | 4 | 5;

/**
 * Throughline labels for levels 1–5.
 * 1 Suggest only · 2 Reads auto · 3 Drafts auto · 4 Acts · gated · 5 Acts · trusted
 */
export const THROUGHLINE_AUTONOMY_LABELS = [
  "Suggest only",
  "Reads auto",
  "Drafts auto",
  "Acts · gated",
  "Acts · trusted",
] as const;

export type ThroughlineAutonomyLabel = (typeof THROUGHLINE_AUTONOMY_LABELS)[number];

/**
 * Operating-model autonomy levels 0–5 (project-daybreak `daybreak-operating-model.md`).
 * 0 Off · 1 Observe · 2 Propose · 3 Prepare · 4 Execute low-risk · 5 Execute consequential
 */
export type OperatingModelAutonomyLevel = 0 | 1 | 2 | 3 | 4 | 5;

export const OPERATING_MODEL_AUTONOMY_NAMES = [
  "Off",
  "Observe",
  "Propose",
  "Prepare",
  "Execute low-risk",
  "Execute consequential",
] as const;

export interface AutonomyMapping {
  throughlineLevel: ThroughlineAutonomyLevel;
  throughlineLabel: ThroughlineAutonomyLabel;
  /** Spike Watch / gate tier (3-level taxonomy). */
  autonomyTier: WatchAutonomyTier;
  /** Operating-model level (0–5). Unreconciled across docs — POC mapping only. */
  operatingModelLevel: OperatingModelAutonomyLevel;
  operatingModelName: (typeof OPERATING_MODEL_AUTONOMY_NAMES)[number];
}

/**
 * POC mapping from Throughline 1–5 → spike `autonomyTier` + operating model 0–5.
 * Taxonomies are not reconciled for GA — see `watch-floor-contract-ratification.md`.
 */
export const THROUGHLINE_TO_SPIKE_AUTONOMY: Record<ThroughlineAutonomyLevel, AutonomyMapping> = {
  1: {
    throughlineLevel: 1,
    throughlineLabel: "Suggest only",
    autonomyTier: "proposed-diff",
    operatingModelLevel: 2,
    operatingModelName: "Propose",
  },
  2: {
    throughlineLevel: 2,
    throughlineLabel: "Reads auto",
    autonomyTier: "auto-run",
    operatingModelLevel: 1,
    operatingModelName: "Observe",
  },
  3: {
    throughlineLevel: 3,
    throughlineLabel: "Drafts auto",
    autonomyTier: "proposed-diff",
    operatingModelLevel: 3,
    operatingModelName: "Prepare",
  },
  4: {
    throughlineLevel: 4,
    throughlineLabel: "Acts · gated",
    autonomyTier: "approval-required",
    operatingModelLevel: 3,
    operatingModelName: "Prepare",
  },
  5: {
    throughlineLevel: 5,
    throughlineLabel: "Acts · trusted",
    autonomyTier: "approval-required",
    operatingModelLevel: 4,
    operatingModelName: "Execute low-risk",
  },
};

/** Resolve spike `autonomyTier` from a Throughline level (defaults to approval-required). */
export const autonomyTierFromThroughline = (
  level: ThroughlineAutonomyLevel,
): WatchAutonomyTier => THROUGHLINE_TO_SPIKE_AUTONOMY[level].autonomyTier;

/** Resolve operating-model level from a Throughline level. */
export const operatingModelFromThroughline = (
  level: ThroughlineAutonomyLevel,
): OperatingModelAutonomyLevel => THROUGHLINE_TO_SPIKE_AUTONOMY[level].operatingModelLevel;
