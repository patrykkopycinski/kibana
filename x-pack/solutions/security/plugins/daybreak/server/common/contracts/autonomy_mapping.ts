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
 * Watch-catalog autonomy levels (project-daybreak `daybreak-watch-catalog.md`).
 */
export type WatchCatalogAutonomyLevel =
  | "Suggest only"
  | "Monitor-only"
  | "Human-in-the-loop"
  | "Human-on-the-loop"
  | "Supervised auto";

export const WATCH_CATALOG_AUTONOMY_LABELS: WatchCatalogAutonomyLevel[] = [
  "Suggest only",
  "Monitor-only",
  "Human-in-the-loop",
  "Human-on-the-loop",
  "Supervised auto",
];

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
  /** Watch-catalog label (product-facing). */
  watchCatalogLabel: WatchCatalogAutonomyLevel;
  /** Spike Watch / gate tier (3-level runtime taxonomy). */
  autonomyTier: WatchAutonomyTier;
  /** Operating-model level (0–5). */
  operatingModelLevel: OperatingModelAutonomyLevel;
  operatingModelName: (typeof OPERATING_MODEL_AUTONOMY_NAMES)[number];
}

/**
 * Reconciled MVP autonomy mapping.
 *
 * All four taxonomies collapse to the same runtime behavior for MVP:
 * - **proposed-diff**: suggest / observe / read-only — no action without human review.
 * - **auto-run**: prepare / draft / human-on-the-loop / supervised auto — non-destructive or pre-approved reversible actions.
 * - **approval-required**: any consequential or gated action — human approval before execution.
 *
 * Consequential actions (Throughline 4–5, operating-model 4–5, human-in-the-loop) stay
 * approval-gated in MVP, even when the underlying capability is trusted.
 */
export const THROUGHLINE_TO_SPIKE_AUTONOMY: Record<ThroughlineAutonomyLevel, AutonomyMapping> = {
  1: {
    throughlineLevel: 1,
    throughlineLabel: "Suggest only",
    watchCatalogLabel: "Suggest only",
    autonomyTier: "proposed-diff",
    operatingModelLevel: 2,
    operatingModelName: "Propose",
  },
  2: {
    throughlineLevel: 2,
    throughlineLabel: "Reads auto",
    watchCatalogLabel: "Monitor-only",
    autonomyTier: "proposed-diff",
    operatingModelLevel: 1,
    operatingModelName: "Observe",
  },
  3: {
    throughlineLevel: 3,
    throughlineLabel: "Drafts auto",
    watchCatalogLabel: "Human-on-the-loop",
    autonomyTier: "auto-run",
    operatingModelLevel: 3,
    operatingModelName: "Prepare",
  },
  4: {
    throughlineLevel: 4,
    throughlineLabel: "Acts · gated",
    watchCatalogLabel: "Human-in-the-loop",
    autonomyTier: "approval-required",
    operatingModelLevel: 4,
    operatingModelName: "Execute low-risk",
  },
  5: {
    throughlineLevel: 5,
    throughlineLabel: "Acts · trusted",
    watchCatalogLabel: "Supervised auto",
    autonomyTier: "approval-required",
    operatingModelLevel: 5,
    operatingModelName: "Execute consequential",
  },
};

/** Resolve spike `autonomyTier` from a Throughline level. */
export const autonomyTierFromThroughline = (
  level: ThroughlineAutonomyLevel,
): WatchAutonomyTier => THROUGHLINE_TO_SPIKE_AUTONOMY[level].autonomyTier;

/** Resolve operating-model level from a Throughline level. */
export const operatingModelFromThroughline = (
  level: ThroughlineAutonomyLevel,
): OperatingModelAutonomyLevel => THROUGHLINE_TO_SPIKE_AUTONOMY[level].operatingModelLevel;

/** Resolve Watch-catalog label from a spike `autonomyTier`. */
export const watchCatalogFromAutonomyTier = (
  tier: WatchAutonomyTier
): WatchCatalogAutonomyLevel => {
  switch (tier) {
    case "auto-run":
      return "Human-on-the-loop";
    case "proposed-diff":
      return "Suggest only";
    case "approval-required":
      return "Human-in-the-loop";
    default:
      return "Human-in-the-loop";
  }
};
