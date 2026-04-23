/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Community-corpus coverage surface — Tier 1.
 *
 * Shape is deliberately flat and demo-ready. The heatmap renders one cell per
 * technique; the cell's signed score is `argus_authored − community_authored`,
 * so positive = Argus over-covers vs community, negative = community covers
 * ground Argus doesn't. Zero + `argus_authored === 0` + `community_authored
 * === 0` renders as an untouched grey cell.
 */
export interface ArgusCoverageCell {
  readonly tactic_id: string;
  readonly tactic_name: string;
  readonly technique_id: string;
  readonly technique_name: string;
  readonly argus_authored: number;
  readonly community_authored: number;
  readonly delta: number;
  /** Sources that contributed at least one rule to this technique. */
  readonly contributing_sources: readonly string[];
  /** True when the technique has ≥ 1 `.soc-detection-patterns` entry. */
  readonly has_pattern: boolean;
}

export interface ArgusCoverageSnapshot {
  readonly profile_id: string | null;
  readonly profile_name: string | null;
  readonly generated_at: string;
  readonly total_techniques: number;
  readonly argus_authored_count: number;
  readonly community_authored_count: number;
  readonly only_community_count: number;
  readonly only_argus_count: number;
  readonly shared_count: number;
  readonly cells: readonly ArgusCoverageCell[];
}

export interface ArgusThreatProfile {
  readonly profile_id: string;
  readonly name: string;
  readonly description: string;
  readonly technique_ids: readonly string[];
  readonly actor_ids: readonly string[];
  /** `builtin` | `user` — `builtin` profiles are seeded on setup. */
  readonly origin: 'builtin' | 'user';
}

export interface ArgusThreatActor {
  readonly actor_id: string;
  readonly actor_name: string;
  readonly aliases: readonly string[];
  readonly techniques: readonly string[];
  readonly software: readonly string[];
  readonly first_seen: string | null;
  readonly last_seen: string | null;
  readonly references: readonly string[];
}

export interface ArgusActorCoverage {
  readonly actor_id: string;
  readonly actor_name: string;
  readonly total_techniques: number;
  readonly covered_by_argus: number;
  readonly covered_by_community_only: number;
  readonly uncovered: number;
  readonly per_technique: readonly ArgusCoverageCell[];
}

export interface ArgusNavigatorLayer {
  readonly name: string;
  readonly description: string;
  readonly domain: 'enterprise-attack';
  readonly versions: { readonly attack: string; readonly navigator: string; readonly layer: string };
  readonly techniques: readonly {
    readonly techniqueID: string;
    readonly score: number;
    readonly color: string;
    readonly comment: string;
    readonly enabled: true;
  }[];
  readonly gradient: {
    readonly colors: readonly [string, string, string];
    readonly minValue: number;
    readonly maxValue: number;
  };
}
