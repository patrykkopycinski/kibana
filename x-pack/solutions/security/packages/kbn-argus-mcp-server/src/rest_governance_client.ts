/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { GovernanceSnapshot, Principal } from '@kbn/argus-tool-manifest';

import type { GovernanceClient } from './types';

/**
 * Config for a governance client that hits Elasticsearch directly to read
 * `.soc-reasoning-eval-runs` and `.soc-actor-trust-tiers`. Takes a
 * fetch-compatible implementation so it can be swapped out in tests.
 */
export interface RestGovernanceClientConfig {
  readonly es_url: string;
  readonly es_auth_header: string;
  readonly fetchImpl?: typeof fetch;
}

const DEFAULT_UNKNOWN: GovernanceSnapshot = Object.freeze({
  adversarial_gate: 'unknown',
  adversarial_min_no_secret_leakage: 0,
  reasoning_gate: 'unknown',
  watchdog_frozen: false,
});

interface EsHit<T> {
  readonly _source?: T;
}

interface EsSearchResult<T> {
  readonly hits?: {
    readonly hits?: ReadonlyArray<EsHit<T>>;
  };
}

interface EvalRunSource {
  readonly gate_decision?: string;
  readonly aggregate?: {
    readonly min?: { readonly no_secret_leakage?: number };
  };
}

interface TrustTierSource {
  readonly watchdog_frozen?: boolean;
}

const parseGate = (raw: string | undefined): GovernanceSnapshot['adversarial_gate'] => {
  if (raw === 'pass' || raw === 'marginal' || raw === 'fail') return raw;
  return 'unknown';
};

/**
 * Reads the latest `.soc-reasoning-eval-runs` doc for each suite_kind, then
 * checks `.soc-actor-trust-tiers` for the principal's watchdog status.
 */
export class RestGovernanceClient implements GovernanceClient {
  private readonly cfg: RestGovernanceClientConfig;
  private readonly http: typeof fetch;

  constructor(cfg: RestGovernanceClientConfig) {
    this.cfg = cfg;
    this.http = cfg.fetchImpl ?? fetch;
  }

  async snapshot(principal: Principal): Promise<GovernanceSnapshot> {
    const [adversarialRun, reasoningRun, tier] = await Promise.all([
      this.latestEvalRun('adversarial'),
      this.latestEvalRun('reasoning'),
      this.latestTrustTier(principal),
    ]);

    return {
      adversarial_gate: parseGate(adversarialRun?.gate_decision),
      adversarial_min_no_secret_leakage:
        adversarialRun?.aggregate?.min?.no_secret_leakage ??
        DEFAULT_UNKNOWN.adversarial_min_no_secret_leakage,
      reasoning_gate: parseGate(reasoningRun?.gate_decision),
      watchdog_frozen: tier?.watchdog_frozen === true,
    };
  }

  private async latestEvalRun(
    suiteKind: 'adversarial' | 'reasoning'
  ): Promise<EvalRunSource | undefined> {
    const body = {
      size: 1,
      query: { term: { suite_kind: suiteKind } },
      sort: [{ '@timestamp': 'desc' }],
    };
    return this.searchFirst<EvalRunSource>('.soc-reasoning-eval-runs', body);
  }

  private async latestTrustTier(principal: Principal): Promise<TrustTierSource | undefined> {
    const actorId = `${principal.protocol}:${principal.client_id}`;
    const body = {
      size: 1,
      query: { term: { actor_id: actorId } },
      sort: [{ '@timestamp': 'desc' }],
    };
    return this.searchFirst<TrustTierSource>('.soc-actor-trust-tiers', body);
  }

  private async searchFirst<T>(index: string, body: unknown): Promise<T | undefined> {
    const url = `${this.cfg.es_url.replace(/\/$/, '')}/${encodeURIComponent(index)}/_search`;
    const res = await this.http(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: this.cfg.es_auth_header,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(
        `argus-mcp: governance fetch ${index} returned ${res.status} ${res.statusText}`
      );
    }
    const json = (await res.json()) as EsSearchResult<T>;
    return json.hits?.hits?.[0]?._source;
  }
}
