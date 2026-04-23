/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ArgusActorCoverage,
  ArgusCoverageCell,
  ArgusCoverageSnapshot,
  ArgusNavigatorLayer,
  ArgusThreatProfile,
} from '../types/coverage';

export interface RawCorpusDoc {
  readonly _id: string;
  readonly _source?: {
    readonly rule_id?: string;
    readonly source?: string;
    readonly mitre_technique?: readonly string[];
  };
}

export interface RawAuthoredDoc {
  readonly _id: string;
  readonly _source?: {
    readonly rule_id?: string;
    readonly mitre_techniques?: ReadonlyArray<{ readonly technique_id?: string }>;
    readonly mitre_technique?: readonly string[];
  };
}

export interface TechniqueMeta {
  readonly technique_id: string;
  readonly technique_name: string;
  readonly tactic_id: string;
  readonly tactic_name: string;
  readonly has_pattern?: boolean;
}

/**
 * Pure, synchronous builder. Feed it raw hits and the tactic/technique catalogue
 * from MITRE; it bucket-sorts by technique and computes the signed delta.
 * Unknown techniques are dropped silently so a drift in MITRE's catalogue
 * can't brick the heatmap.
 */
export const buildCoverageSnapshot = (args: {
  readonly profile: ArgusThreatProfile | null;
  readonly corpusDocs: readonly RawCorpusDoc[];
  readonly authoredDocs: readonly RawAuthoredDoc[];
  readonly techniqueCatalogue: readonly TechniqueMeta[];
  readonly generatedAt: string;
}): ArgusCoverageSnapshot => {
  const { profile, corpusDocs, authoredDocs, techniqueCatalogue, generatedAt } = args;
  const techniqueFilter = profile ? new Set(profile.technique_ids) : null;

  const cellMap = new Map<
    string,
    {
      argus: number;
      community: number;
      sources: Set<string>;
      meta: TechniqueMeta;
    }
  >();

  for (const meta of techniqueCatalogue) {
    if (techniqueFilter && !techniqueFilter.has(meta.technique_id)) continue;
    cellMap.set(meta.technique_id, {
      argus: 0,
      community: 0,
      sources: new Set<string>(),
      meta,
    });
  }

  for (const doc of corpusDocs) {
    const src = doc._source;
    if (!src) continue;
    const source = src.source ?? 'unknown';
    const techniques = src.mitre_technique ?? [];
    for (const id of techniques) {
      const cell = cellMap.get(id);
      if (!cell) continue;
      cell.community += 1;
      cell.sources.add(source);
    }
  }

  for (const doc of authoredDocs) {
    const src = doc._source;
    if (!src) continue;
    const raw =
      (src.mitre_techniques ?? [])
        .map((t) => t.technique_id)
        .filter((x): x is string => Boolean(x)) ??
      src.mitre_technique ??
      [];
    for (const id of raw) {
      const cell = cellMap.get(id);
      if (!cell) continue;
      cell.argus += 1;
      cell.sources.add('argus');
    }
  }

  const cells: ArgusCoverageCell[] = [];
  let argusAuthoredCount = 0;
  let communityAuthoredCount = 0;
  let onlyCommunityCount = 0;
  let onlyArgusCount = 0;
  let sharedCount = 0;

  for (const { argus, community, sources, meta } of cellMap.values()) {
    if (argus > 0) argusAuthoredCount += 1;
    if (community > 0) communityAuthoredCount += 1;
    if (argus > 0 && community === 0) onlyArgusCount += 1;
    if (argus === 0 && community > 0) onlyCommunityCount += 1;
    if (argus > 0 && community > 0) sharedCount += 1;

    cells.push({
      tactic_id: meta.tactic_id,
      tactic_name: meta.tactic_name,
      technique_id: meta.technique_id,
      technique_name: meta.technique_name,
      argus_authored: argus,
      community_authored: community,
      delta: argus - community,
      contributing_sources: Array.from(sources).sort(),
      has_pattern: Boolean(meta.has_pattern),
    });
  }

  cells.sort((a, b) => {
    if (a.tactic_id === b.tactic_id) return a.technique_id.localeCompare(b.technique_id);
    return a.tactic_id.localeCompare(b.tactic_id);
  });

  return {
    profile_id: profile?.profile_id ?? null,
    profile_name: profile?.name ?? null,
    generated_at: generatedAt,
    total_techniques: cells.length,
    argus_authored_count: argusAuthoredCount,
    community_authored_count: communityAuthoredCount,
    only_community_count: onlyCommunityCount,
    only_argus_count: onlyArgusCount,
    shared_count: sharedCount,
    cells,
  };
};

export const buildActorCoverage = (args: {
  readonly actor: { readonly actor_id: string; readonly actor_name: string; readonly techniques: readonly string[] };
  readonly snapshot: ArgusCoverageSnapshot;
}): ArgusActorCoverage => {
  const { actor, snapshot } = args;
  const actorTechniques = new Set(actor.techniques);
  const perTechnique = snapshot.cells.filter((c) => actorTechniques.has(c.technique_id));
  let coveredByArgus = 0;
  let coveredByCommunityOnly = 0;
  let uncovered = 0;

  for (const cell of perTechnique) {
    if (cell.argus_authored > 0) coveredByArgus += 1;
    else if (cell.community_authored > 0) coveredByCommunityOnly += 1;
    else uncovered += 1;
  }

  return {
    actor_id: actor.actor_id,
    actor_name: actor.actor_name,
    total_techniques: actor.techniques.length,
    covered_by_argus: coveredByArgus,
    covered_by_community_only: coveredByCommunityOnly,
    uncovered,
    per_technique: perTechnique,
  };
};

/**
 * Emit an ATT&CK Navigator layer JSON (schema v4.5). Score range is -3..+3
 * after clamping so the gradient maps cleanly to the community-vs-argus
 * delta. Operators can drop the file directly into Navigator to see the
 * heatmap outside of Kibana.
 */
export const buildNavigatorLayer = (args: {
  readonly snapshot: ArgusCoverageSnapshot;
  readonly name: string;
  readonly attackVersion?: string;
}): ArgusNavigatorLayer => {
  const { snapshot, name, attackVersion = '14' } = args;
  const techniques = snapshot.cells.map((cell) => {
    const score = Math.max(-3, Math.min(3, cell.delta));
    const color = deltaToColor(score);
    const comment = buildComment(cell);
    return {
      techniqueID: cell.technique_id,
      score,
      color,
      comment,
      enabled: true as const,
    };
  });

  return {
    name,
    description: `ARGUS coverage layer — generated ${snapshot.generated_at}`,
    domain: 'enterprise-attack',
    versions: { attack: attackVersion, navigator: '4.9', layer: '4.5' },
    techniques,
    gradient: {
      colors: ['#ff6b6b', '#ffffff', '#4dabf7'],
      minValue: -3,
      maxValue: 3,
    },
  };
};

const buildComment = (cell: ArgusCoverageCell): string => {
  const sources = cell.contributing_sources.length
    ? cell.contributing_sources.join(', ')
    : 'none';
  return `ARGUS ${cell.argus_authored} · Community ${cell.community_authored} · Sources: ${sources}`;
};

const deltaToColor = (score: number): string => {
  if (score <= -2) return '#e03131';
  if (score < 0) return '#ffa8a8';
  if (score === 0) return '#f1f3f5';
  if (score < 2) return '#74c0fc';
  return '#1c7ed6';
};
