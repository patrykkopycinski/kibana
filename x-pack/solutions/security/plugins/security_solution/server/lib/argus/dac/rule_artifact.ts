/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elastic B.V. and/or licensed to Elastic B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * AutoDEX B4 — Detection-as-code (DaC) rule artifact.
 *
 * Vision-doc §1.6.1 calls for a git-backed deployment path so detection
 * rules become committable, reviewable, round-trippable artifacts —
 * not just live state mutated in place via the Detection Engine API.
 * This module is the pure-logic core of the spike: it defines a
 * canonical artifact envelope, a serializer (rule → artifact), and a
 * parser (artifact → rule) that round-trip with byte-identical
 * stability.
 *
 * Envelope shape (modelled on Kubernetes CRDs for familiarity):
 *
 *   apiVersion: argus.elastic.co/v1
 *   kind: ARGUSDetectionRule
 *   metadata:
 *     name: <rule_id>
 *     version: <rule_version>
 *     source: argus | manual | imported
 *     authored_by: <agent_id | analyst handle>
 *     authored_at: <ISO8601>
 *   spec:
 *     name: <human name>
 *     description: <…>
 *     query: <ES Query DSL>
 *     gate_overrides: <optional B6 per-rule overrides>
 *
 * The artifact is JSON-serialisable and YAML-friendly. Round-trip
 * stability is enforced by the test suite — a rule serialised and then
 * parsed must `toEqual` itself, and an artifact serialised and then
 * parsed must `toEqual` itself.
 *
 * Out of scope (handled by the consumer):
 *   - Actual file I/O: the spike workflow writes artifact JSON to
 *     `.soc-dac-export-queue` for a sidecar process to commit; this
 *     module is filesystem-agnostic.
 *   - YAML serialisation: the consumer can stringify via
 *     `yaml.stringify(toArtifact(rule))` if it prefers YAML.
 *   - Git operations: branch creation, PR opening, merge handling are
 *     consumer concerns.
 */

import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';

export interface DacArtifactMetadata {
  readonly name: string;
  readonly version: string;
  readonly source: DacArtifactSource;
  readonly authored_by?: string;
  readonly authored_at?: string;
  readonly labels?: Readonly<Record<string, string>>;
  readonly annotations?: Readonly<Record<string, string>>;
}

export type DacArtifactSource = 'argus' | 'manual' | 'imported';

export interface DacArtifactSpec {
  readonly name: string;
  readonly description: string;
  readonly query: QueryDslQueryContainer;
  readonly gate_overrides?: Readonly<Record<string, number | undefined>>;
}

export interface DacRuleArtifact {
  readonly apiVersion: 'argus.elastic.co/v1';
  readonly kind: 'ARGUSDetectionRule';
  readonly metadata: DacArtifactMetadata;
  readonly spec: DacArtifactSpec;
}

export interface RuleLikeInput {
  readonly rule_id: string;
  readonly rule_version: string;
  readonly name: string;
  readonly description: string;
  readonly query: QueryDslQueryContainer;
  readonly gate_overrides?: Readonly<Record<string, number | undefined>>;
}

export interface ToArtifactOptions {
  readonly source?: DacArtifactSource;
  readonly authored_by?: string;
  readonly authored_at?: string;
  readonly labels?: Readonly<Record<string, string>>;
  readonly annotations?: Readonly<Record<string, string>>;
}

const DEFAULT_SOURCE: DacArtifactSource = 'argus';

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sortKeys = <T extends Record<string, unknown>>(value: T): T => {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = value[key];
  }
  return sorted as T;
};

/**
 * Serialise a `CandidateRule`-shaped input into a canonical DaC
 * artifact. Keys inside `metadata.labels` / `metadata.annotations` are
 * sorted so two artifacts produced from semantically-equivalent rules
 * are byte-identical (round-trip + git-diff-friendly).
 */
export const toArtifact = (
  rule: RuleLikeInput,
  options: ToArtifactOptions = {}
): DacRuleArtifact => {
  if (!isNonEmptyString(rule.rule_id)) {
    throw new Error('toArtifact: rule.rule_id must be a non-empty string');
  }
  if (!isNonEmptyString(rule.rule_version)) {
    throw new Error('toArtifact: rule.rule_version must be a non-empty string');
  }
  if (!isPlainObject(rule.query)) {
    throw new Error('toArtifact: rule.query must be a plain object');
  }

  const metadata: DacArtifactMetadata = {
    name: rule.rule_id,
    version: rule.rule_version,
    source: options.source ?? DEFAULT_SOURCE,
    ...(options.authored_by !== undefined ? { authored_by: options.authored_by } : {}),
    ...(options.authored_at !== undefined ? { authored_at: options.authored_at } : {}),
    ...(options.labels !== undefined ? { labels: sortKeys({ ...options.labels }) } : {}),
    ...(options.annotations !== undefined
      ? { annotations: sortKeys({ ...options.annotations }) }
      : {}),
  };

  const spec: DacArtifactSpec = {
    name: rule.name,
    description: rule.description,
    query: rule.query,
    ...(rule.gate_overrides !== undefined
      ? { gate_overrides: sortKeys({ ...rule.gate_overrides }) }
      : {}),
  };

  return {
    apiVersion: 'argus.elastic.co/v1',
    kind: 'ARGUSDetectionRule',
    metadata,
    spec,
  };
};

/**
 * Parse an artifact-shaped JSON object back into a `CandidateRule`-
 * shaped object. Throws loudly on schema drift — this is the gate
 * that prevents a corrupted artifact from flowing back into the
 * applier.
 */
export const fromArtifact = (raw: unknown): RuleLikeInput => {
  if (!isPlainObject(raw)) {
    throw new Error('fromArtifact: artifact must be a plain object');
  }
  if (raw.apiVersion !== 'argus.elastic.co/v1') {
    throw new Error(
      `fromArtifact: unsupported apiVersion ${String(
        raw.apiVersion
      )} (expected argus.elastic.co/v1)`
    );
  }
  if (raw.kind !== 'ARGUSDetectionRule') {
    throw new Error(
      `fromArtifact: unsupported kind ${String(raw.kind)} (expected ARGUSDetectionRule)`
    );
  }
  if (!isPlainObject(raw.metadata)) {
    throw new Error('fromArtifact: metadata must be a plain object');
  }
  if (!isPlainObject(raw.spec)) {
    throw new Error('fromArtifact: spec must be a plain object');
  }

  const { metadata, spec } = raw;

  if (!isNonEmptyString(metadata.name)) {
    throw new Error('fromArtifact: metadata.name must be a non-empty string');
  }
  if (!isNonEmptyString(metadata.version)) {
    throw new Error('fromArtifact: metadata.version must be a non-empty string');
  }
  if (!isNonEmptyString(spec.name)) {
    throw new Error('fromArtifact: spec.name must be a non-empty string');
  }
  if (!isNonEmptyString(spec.description)) {
    throw new Error('fromArtifact: spec.description must be a non-empty string');
  }
  if (!isPlainObject(spec.query)) {
    throw new Error('fromArtifact: spec.query must be a plain object');
  }

  const result: RuleLikeInput = {
    rule_id: metadata.name,
    rule_version: metadata.version,
    name: spec.name,
    description: spec.description,
    query: spec.query as QueryDslQueryContainer,
    ...(isPlainObject(spec.gate_overrides)
      ? { gate_overrides: spec.gate_overrides as Record<string, number | undefined> }
      : {}),
  };

  return result;
};

/**
 * Convenience: serialise an artifact to a deterministic JSON string
 * (sorted keys, 2-space indent). Useful when writing to git so
 * diffs are minimal.
 */
export const stringifyArtifact = (artifact: DacRuleArtifact): string => {
  const ordered = {
    apiVersion: artifact.apiVersion,
    kind: artifact.kind,
    metadata: artifact.metadata,
    spec: artifact.spec,
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
};
