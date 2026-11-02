/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parse } from 'yaml';
import {
  ATTACK_DISCOVERY_SKILL_ALERT_RETRIEVAL_WORKFLOW_ID,
  ATTACK_DISCOVERY_SKILL_REPORT_WORKFLOW_ID,
  getManagedWorkflowDefinition,
} from '@kbn/workflows/managed';
import type { EsClient } from '@kbn/scout';
import type { ToolingLog } from '@kbn/tooling-log';
import type { AttackDiscoveryDatasetExample, AttackDiscoveryTaskOutput } from '../types';
import {
  ATTACK_DISCOVERY_GATE_FEATURE_ID,
  ATTACK_DISCOVERY_GENERATION_FEATURE_ID,
  ATTACK_DISCOVERY_PARENT_FEATURE_ID,
  ATTACK_DISCOVERY_REPORT_FEATURE_ID,
  ATTACK_DISCOVERY_TOKEN_PHASES,
  computePhaseTokenUsage,
  createAttackDiscoveryTokenUsageEvaluators,
  type TokenUsageDoc,
} from './attack_discovery_token_usage_evaluator';

const T0 = Date.parse('2026-01-01T00:00:00.000Z');

const doc = ({
  atSec,
  prompt,
  cached,
  completion = 10,
  featureId,
  parentFeatureId,
}: {
  atSec: number;
  prompt: number;
  cached?: number;
  completion?: number;
  featureId?: string;
  parentFeatureId?: string;
}): TokenUsageDoc => ({
  '@timestamp': new Date(T0 + atSec * 1000).toISOString(),
  token_usage: {
    prompt_tokens: prompt,
    completion_tokens: completion,
    ...(cached !== undefined ? { cached_tokens: cached } : {}),
  },
  inference: {
    connector_id: 'c-1',
    ...(featureId ? { feature_id: featureId } : {}),
    ...(parentFeatureId ? { parent_feature_id: parentFeatureId } : {}),
  },
});

const ZERO = {
  inputTokens: 0,
  cachedTokens: 0,
  uncachedTokens: 0,
  outputTokens: 0,
  calls: 0,
  peak60sInputTokens: 0,
  maxCallInputTokens: 0,
};

describe('computePhaseTokenUsage', () => {
  it('returns zeros for every phase when there are no docs', () => {
    const usage = computePhaseTokenUsage([]);

    expect(Object.keys(usage).sort()).toEqual([...ATTACK_DISCOVERY_TOKEN_PHASES].sort());
    for (const phase of ATTACK_DISCOVERY_TOKEN_PHASES) {
      expect(usage[phase]).toEqual(ZERO);
    }
  });

  it('buckets by feature id into gate, report, generation and untagged', () => {
    const usage = computePhaseTokenUsage([
      doc({
        atSec: 0,
        prompt: 100,
        featureId: ATTACK_DISCOVERY_GATE_FEATURE_ID,
        parentFeatureId: ATTACK_DISCOVERY_PARENT_FEATURE_ID,
      }),
      doc({
        atSec: 1,
        prompt: 200,
        featureId: ATTACK_DISCOVERY_REPORT_FEATURE_ID,
        parentFeatureId: ATTACK_DISCOVERY_PARENT_FEATURE_ID,
      }),
      doc({
        atSec: 2,
        prompt: 300,
        featureId: ATTACK_DISCOVERY_GENERATION_FEATURE_ID,
        parentFeatureId: ATTACK_DISCOVERY_PARENT_FEATURE_ID,
      }),
      doc({ atSec: 3, prompt: 400 }),
      doc({ atSec: 4, prompt: 50, featureId: 'something_else' }),
    ]);

    expect(usage.gate.inputTokens).toBe(100);
    expect(usage.report.inputTokens).toBe(200);
    expect(usage.generation.inputTokens).toBe(300);
    expect(usage.untagged.inputTokens).toBe(450);
    expect(usage.untagged.calls).toBe(2);
  });

  it('does not classify generation by the parent feature alone', () => {
    const usage = computePhaseTokenUsage([
      doc({ atSec: 0, prompt: 300, parentFeatureId: ATTACK_DISCOVERY_PARENT_FEATURE_ID }),
      doc({
        atSec: 1,
        prompt: 70,
        featureId: 'some_other_step',
        parentFeatureId: ATTACK_DISCOVERY_PARENT_FEATURE_ID,
      }),
    ]);

    expect(usage.generation.calls).toBe(0);
    expect(usage.untagged.inputTokens).toBe(370);
  });

  it('skips calls with a non-finite timestamp in the peak window but still counts them', () => {
    const gate = ATTACK_DISCOVERY_GATE_FEATURE_ID;
    const bad = doc({ atSec: 0, prompt: 500, featureId: gate });
    bad['@timestamp'] = 'not-a-date';
    const usage = computePhaseTokenUsage([bad, doc({ atSec: 5, prompt: 100, featureId: gate })]);

    expect(usage.gate.inputTokens).toBe(600);
    expect(usage.gate.calls).toBe(2);
    expect(usage.gate.peak60sInputTokens).toBe(100);
  });

  it('treats cached tokens as a subset of input and derives uncached', () => {
    const usage = computePhaseTokenUsage([
      doc({
        atSec: 0,
        prompt: 1000,
        cached: 600,
        completion: 40,
        featureId: 'attack_discovery_gate',
      }),
      doc({ atSec: 5, prompt: 500, completion: 10, featureId: 'attack_discovery_gate' }),
    ]);

    expect(usage.gate).toEqual({
      inputTokens: 1500,
      cachedTokens: 600,
      uncachedTokens: 900,
      outputTokens: 50,
      calls: 2,
      peak60sInputTokens: 1500,
      maxCallInputTokens: 1000,
    });
  });

  it('computes the peak input over any sliding 60s window', () => {
    const gate = 'attack_discovery_gate';
    const usage = computePhaseTokenUsage([
      doc({ atSec: 0, prompt: 100, featureId: gate }),
      doc({ atSec: 30, prompt: 100, featureId: gate }),
      doc({ atSec: 59, prompt: 100, featureId: gate }),
      // exactly 60s after the first call: the first call has left the window
      doc({ atSec: 60, prompt: 100, featureId: gate }),
      doc({ atSec: 200, prompt: 250, featureId: gate }),
    ]);

    expect(usage.gate.peak60sInputTokens).toBe(300);
    expect(usage.gate.inputTokens).toBe(650);
  });

  it('is independent of document order', () => {
    const gate = 'attack_discovery_gate';
    const usage = computePhaseTokenUsage([
      doc({ atSec: 50, prompt: 10, featureId: gate }),
      doc({ atSec: 0, prompt: 10, featureId: gate }),
      doc({ atSec: 100, prompt: 10, featureId: gate }),
    ]);

    expect(usage.gate.peak60sInputTokens).toBe(20);
  });
});

describe('phase ids', () => {
  const featureIdOf = (workflowId: string): string | undefined => {
    const definition = getManagedWorkflowDefinition(workflowId);
    if (!definition || !('yaml' in definition) || typeof definition.yaml !== 'string') {
      throw new Error(`managed workflow ${workflowId} has no static yaml`);
    }
    const parsed = parse(definition.yaml) as {
      steps?: Array<{ 'plugin-id'?: string; 'aggregate-by'?: string }>;
    };
    const tagged = (parsed.steps ?? []).filter((step) => step['plugin-id'] !== undefined);
    expect(tagged).toHaveLength(1);
    expect(tagged[0]['aggregate-by']).toBe(ATTACK_DISCOVERY_PARENT_FEATURE_ID);
    return tagged[0]['plugin-id'];
  };

  it('matches the ids the gate and report workflows emit', () => {
    expect(featureIdOf(ATTACK_DISCOVERY_SKILL_ALERT_RETRIEVAL_WORKFLOW_ID)).toBe(
      ATTACK_DISCOVERY_GATE_FEATURE_ID
    );
    expect(featureIdOf(ATTACK_DISCOVERY_SKILL_REPORT_WORKFLOW_ID)).toBe(
      ATTACK_DISCOVERY_REPORT_FEATURE_ID
    );
  });

  it('exports the literal ids the usage index is queried with', () => {
    expect(ATTACK_DISCOVERY_GATE_FEATURE_ID).toBe('attack_discovery_gate');
    expect(ATTACK_DISCOVERY_REPORT_FEATURE_ID).toBe('attack_discovery_report');
    expect(ATTACK_DISCOVERY_GENERATION_FEATURE_ID).toBe('attack_discovery_generation');
    expect(ATTACK_DISCOVERY_PARENT_FEATURE_ID).toBe('attack_discovery');
  });
});

interface SearchRequest {
  size?: number;
  track_total_hits?: boolean;
  query?: {
    bool?: {
      filter?: Array<{
        range?: Record<string, { gte?: string; lte?: string }>;
        term?: Record<string, string>;
      }>;
      must_not?: Array<{ term?: Record<string, string> }>;
    };
  };
}

describe('createAttackDiscoveryTokenUsageEvaluators', () => {
  const log = { warning: jest.fn(), debug: jest.fn() } as unknown as ToolingLog;
  const STARTED_AT = '2026-01-01T00:00:00.000Z';

  const workflowOutput = (raw: Record<string, unknown> = {}): AttackDiscoveryTaskOutput => ({
    insights: null,
    raw: {
      started_at: STARTED_AT,
      latency_ms: 1000,
      workflow_runs: {},
      token_usage_tracking_enabled: true,
      ...raw,
    },
  });

  const example = {
    input: { mode: 'workflowApi', connectorId: 'c-1' },
    output: { attackDiscoveries: [] },
    metadata: {},
  } as unknown as AttackDiscoveryDatasetExample;

  /** Injected clock: `sleep` advances `now`, so settle logic runs without real timers. */
  const createClock = () => {
    const clock = { t: 0 };
    return {
      clock,
      now: () => clock.t,
      sleep: async (ms: number) => {
        clock.t += ms;
      },
    };
  };

  interface FakeDoc {
    doc: TokenUsageDoc;
    /** Clock time (ms) from which the doc is visible to searches. */
    arrivesAtMs?: number;
  }

  /** Interprets the range / connector filters of the evaluator's queries. */
  const createEs = (
    source: Array<TokenUsageDoc | FakeDoc> | Error,
    options: { clock?: { t: number }; totalOverride?: number } = {}
  ) => {
    const search = jest.fn(async (request: SearchRequest) => {
      if (source instanceof Error) throw source;
      const filters = request.query?.bool?.filter ?? [];
      const range = filters.find((f) => f.range)?.range?.['@timestamp'] ?? {};
      const connector = filters.find((f) => f.term)?.term?.['inference.connector_id'];
      const excludedFeatureIds = (request.query?.bool?.must_not ?? []).flatMap((clause) =>
        clause.term?.['inference.feature_id'] ? [clause.term['inference.feature_id']] : []
      );
      const now = options.clock?.t ?? 0;
      const visible = source
        .map((entry) => ('doc' in entry ? entry : { doc: entry as TokenUsageDoc }))
        .filter(({ arrivesAtMs = 0 }) => arrivesAtMs <= now)
        .map(({ doc: d }) => d)
        .filter((d) => {
          const at = Date.parse(d['@timestamp']);
          if (range.gte !== undefined && at < Date.parse(range.gte)) return false;
          if (range.lte !== undefined && at > Date.parse(range.lte)) return false;
          if (excludedFeatureIds.includes(d.inference?.feature_id ?? '')) return false;
          return connector === undefined || d.inference?.connector_id === connector;
        });
      const maxMs = visible.length
        ? Math.max(...visible.map((d) => Date.parse(d['@timestamp'])))
        : null;
      return {
        hits: {
          total: { value: options.totalOverride ?? visible.length, relation: 'eq' },
          hits: (request.size === 0 ? [] : visible.slice(0, request.size)).map((_source) => ({
            _source,
          })),
        },
        aggregations: {
          last_doc: {
            value: maxMs,
            ...(maxMs !== null ? { value_as_string: new Date(maxMs).toISOString() } : {}),
          },
        },
      };
    });
    return { esClient: { search } as unknown as EsClient, search };
  };

  const build = (
    esClient: EsClient,
    clockKit = createClock(),
    settle = { quietMs: 60_000, maxWaitMs: 600_000, pollIntervalMs: 10_000 }
  ) =>
    createAttackDiscoveryTokenUsageEvaluators({
      esClient,
      log,
      settle,
      now: clockKit.now,
      sleep: clockKit.sleep,
    });

  const run = async (
    evaluators: ReturnType<typeof createAttackDiscoveryTokenUsageEvaluators>,
    output: AttackDiscoveryTaskOutput
  ) =>
    Promise.all(
      evaluators.map(async (evaluator) => ({
        name: evaluator.name,
        direction: evaluator.direction,
        result: await evaluator.evaluate({
          input: example.input,
          output,
          expected: example.output,
          metadata: example.metadata,
        }),
      }))
    );

  const taggedGate = (atSec: number, prompt = 800) =>
    doc({
      atSec,
      prompt,
      cached: 300,
      completion: 20,
      featureId: ATTACK_DISCOVERY_GATE_FEATURE_ID,
      parentFeatureId: ATTACK_DISCOVERY_PARENT_FEATURE_ID,
    });

  it('emits one neutral informational evaluator per phase, with the breakdown in metadata', async () => {
    const { esClient } = createEs([taggedGate(1)]);

    const results = await run(build(esClient), workflowOutput());

    expect(results.map((r) => r.name)).toEqual([
      'AttackDiscoveryTokens:gate',
      'AttackDiscoveryTokens:report',
      'AttackDiscoveryTokens:generation',
      'AttackDiscoveryTokens:untagged',
    ]);
    expect(results.every((r) => r.direction === 'neutral')).toBe(true);

    const gate = results[0].result;
    expect(gate.score).toBe(800);
    expect(gate.metadata).toMatchObject({
      phase: 'gate',
      inputTokens: 800,
      cachedTokens: 300,
      uncachedTokens: 500,
      outputTokens: 20,
      calls: 1,
      peak60sInputTokens: 800,
      maxCallInputTokens: 800,
      truncated: false,
    });
    expect(results[1].result.score).toBe(0);
  });

  it('mirrors production today: untagged generation calls are counted in untagged, with a note', async () => {
    const { esClient } = createEs([
      taggedGate(1),
      doc({
        atSec: 2,
        prompt: 100,
        featureId: ATTACK_DISCOVERY_REPORT_FEATURE_ID,
        parentFeatureId: ATTACK_DISCOVERY_PARENT_FEATURE_ID,
      }),
      doc({ atSec: 3, prompt: 5000 }),
      doc({ atSec: 4, prompt: 6000 }),
    ]);

    const byName = Object.fromEntries(
      (await run(build(esClient), workflowOutput())).map((r) => [r.name, r.result])
    );

    const generation = byName['AttackDiscoveryTokens:generation'];
    const untagged = byName['AttackDiscoveryTokens:untagged'];
    expect(generation.score).toBe(0);
    expect(untagged.score).toBe(11_000);
    expect(generation.label).toBe('generation_untagged');
    expect(untagged.label).toBe('generation_untagged');
    expect(generation.metadata?.note).toMatch(/generation calls are untagged on this build/);
    expect(untagged.metadata?.note).toMatch(/counted in `untagged`/);
    expect(byName['AttackDiscoveryTokens:gate'].label).toBe('ok');
  });

  it('attributes generation when the generation feature id is emitted', async () => {
    const { esClient } = createEs([
      taggedGate(1),
      doc({
        atSec: 3,
        prompt: 5000,
        featureId: ATTACK_DISCOVERY_GENERATION_FEATURE_ID,
        parentFeatureId: ATTACK_DISCOVERY_PARENT_FEATURE_ID,
      }),
    ]);

    const byName = Object.fromEntries(
      (await run(build(esClient), workflowOutput())).map((r) => [r.name, r.result])
    );

    expect(byName['AttackDiscoveryTokens:generation'].score).toBe(5000);
    expect(byName['AttackDiscoveryTokens:generation'].label).toBe('ok');
    expect(byName['AttackDiscoveryTokens:generation'].metadata).not.toHaveProperty('note');
    expect(byName['AttackDiscoveryTokens:untagged'].score).toBe(0);
  });

  it('queries once per run, bounded by the run start, the usage window end and the connector', async () => {
    const { esClient, search } = createEs([taggedGate(1), taggedGate(20)]);

    const results = await run(build(esClient), workflowOutput());

    const finalRequest = (search.mock.calls as unknown as Array<[SearchRequest]>)
      .map(([request]) => request)
      .filter((request) => request.size !== 0);
    expect(finalRequest).toHaveLength(1);
    const body = JSON.stringify(finalRequest[0]);
    expect(body).toContain('.kibana-inference-token-usage');
    expect(body).toContain(STARTED_AT);
    expect(body).toContain('inference.connector_id');
    expect(body).toContain('c-1');
    expect(finalRequest[0].track_total_hits).toBe(true);

    const windowEnd = new Date(T0 + 20_000).toISOString();
    expect(JSON.stringify(finalRequest[0].query)).toContain(`"lte":"${windowEnd}"`);
    expect(results[0].result.metadata?.usage_window_end).toBe(windowEnd);
  });

  describe('eval judge calls', () => {
    afterEach(() => {
      delete process.env.KBN_EVALS_TELEMETRY_PLUGIN_ID;
    });

    const judgeDoc = (featureId: string) =>
      doc({ atSec: 5, prompt: 99_999, featureId, parentFeatureId: 'kbn_evals_parent' });

    it('excludes docs tagged with the evals telemetry plugin id from both queries', async () => {
      const { esClient, search } = createEs([taggedGate(1), judgeDoc('kbn_evals')]);

      const results = await run(build(esClient), workflowOutput());

      const byName = Object.fromEntries(results.map((r) => [r.name, r.result]));
      expect(byName['AttackDiscoveryTokens:gate'].score).toBe(800);
      expect(byName['AttackDiscoveryTokens:untagged'].score).toBe(0);
      expect(byName['AttackDiscoveryTokens:untagged'].metadata?.total_hits).toBe(1);
      const requests = (search.mock.calls as unknown as Array<[SearchRequest]>).map(
        ([request]) => request
      );
      expect(requests.length).toBeGreaterThan(1);
      for (const request of requests) {
        expect(request.query?.bool?.must_not).toEqual([
          { term: { 'inference.feature_id': 'kbn_evals' } },
        ]);
      }
    });

    it('honours KBN_EVALS_TELEMETRY_PLUGIN_ID, trimmed', async () => {
      process.env.KBN_EVALS_TELEMETRY_PLUGIN_ID = '  my_evals  ';
      const { esClient } = createEs([taggedGate(1), judgeDoc('my_evals'), judgeDoc('kbn_evals')]);

      const results = await run(build(esClient), workflowOutput());

      const untagged = results.find((r) => r.name === 'AttackDiscoveryTokens:untagged')!.result;
      expect(untagged.score).toBe(99_999);
    });

    it('falls back to kbn_evals when the env var is blank', async () => {
      process.env.KBN_EVALS_TELEMETRY_PLUGIN_ID = '   ';
      const { esClient } = createEs([taggedGate(1), judgeDoc('kbn_evals')]);

      const results = await run(build(esClient), workflowOutput());

      expect(results[3].result.score).toBe(0);
    });
  });

  describe('report run status', () => {
    it('surfaces the report run id and status from the task output in metadata', async () => {
      const { esClient } = createEs([taggedGate(1)]);

      const results = await run(
        build(esClient),
        workflowOutput({ report_run_id: 'report-1', report_run_status: 'completed' })
      );

      expect(results[0].result.metadata).toMatchObject({
        report_run_id: 'report-1',
        report_run_status: 'completed',
      });
    });
  });

  describe('settling', () => {
    it('counts a usage doc that arrives more than 60s after the previous one with the default settle', async () => {
      const clockKit = createClock();
      const { esClient } = createEs(
        [
          { doc: taggedGate(1), arrivesAtMs: 0 },
          {
            doc: doc({ atSec: 95, prompt: 700, featureId: ATTACK_DISCOVERY_REPORT_FEATURE_ID }),
            arrivesAtMs: 90_000,
          },
        ],
        { clock: clockKit.clock }
      );
      const evaluators = createAttackDiscoveryTokenUsageEvaluators({
        esClient,
        log,
        now: clockKit.now,
        sleep: clockKit.sleep,
      });

      const results = await run(evaluators, workflowOutput());

      const report = results.find((r) => r.name === 'AttackDiscoveryTokens:report')!.result;
      expect(report.score).toBe(700);
      expect(report.metadata).toMatchObject({ settled: true });
    });

    it('waits for a quiet period with no new usage docs before reading', async () => {
      const clockKit = createClock();
      const { esClient } = createEs(
        [
          { doc: taggedGate(1), arrivesAtMs: 0 },
          {
            doc: doc({
              atSec: 40,
              prompt: 200,
              featureId: ATTACK_DISCOVERY_REPORT_FEATURE_ID,
            }),
            arrivesAtMs: 30_000,
          },
        ],
        { clock: clockKit.clock }
      );

      const results = await run(build(esClient, clockKit), workflowOutput());

      const byName = Object.fromEntries(results.map((r) => [r.name, r.result]));
      // the report doc arrived 30s in; settle must keep waiting past it
      expect(byName['AttackDiscoveryTokens:report'].score).toBe(200);
      // last new doc seen at ~30s + 60s quiet
      expect(clockKit.clock.t).toBeGreaterThanOrEqual(90_000);
      expect(byName['AttackDiscoveryTokens:report'].metadata).toMatchObject({
        settled: true,
        usage_window_end: new Date(T0 + 40_000).toISOString(),
      });
    });

    it('stops at the max wait when usage keeps arriving, and says it did not settle', async () => {
      const clockKit = createClock();
      const trickle = Array.from({ length: 40 }, (_, i) => ({
        doc: doc({ atSec: i * 15, prompt: 10, featureId: ATTACK_DISCOVERY_REPORT_FEATURE_ID }),
        arrivesAtMs: i * 15_000,
      }));
      const { esClient } = createEs(trickle, { clock: clockKit.clock });

      const results = await run(
        build(esClient, clockKit, { quietMs: 60_000, maxWaitMs: 120_000, pollIntervalMs: 10_000 }),
        workflowOutput()
      );

      expect(clockKit.clock.t).toBeGreaterThanOrEqual(120_000);
      expect(clockKit.clock.t).toBeLessThan(140_000);
      expect(results[1].result.metadata).toMatchObject({ settled: false });
    });

    it('settles once per run, not once per phase evaluator', async () => {
      const clockKit = createClock();
      const { esClient, search } = createEs([taggedGate(1)], { clock: clockKit.clock });
      const output = workflowOutput();

      await run(build(esClient, clockKit), output);
      const callsAfterFirstRun = search.mock.calls.length;
      await run(build(esClient, clockKit), output);

      // a second evaluator set shares nothing, but within one set every phase shares the lookup
      expect(callsAfterFirstRun).toBeGreaterThan(1);
      const finalQueries = (search.mock.calls as unknown as Array<[SearchRequest]>).filter(
        ([request]) => request.size !== 0
      );
      expect(finalQueries).toHaveLength(2);
    });
  });

  describe('when usage cannot be trusted', () => {
    it('reports unavailable, not zero, when the run found no usage docs', async () => {
      const { esClient } = createEs([]);

      const results = await run(build(esClient), workflowOutput());

      for (const { result } of results) {
        expect(result.score).toBeNull();
        expect(result.label).toBe('unavailable');
        expect(result.explanation).toMatch(/no token usage docs/i);
      }
    });

    it('reports unavailable without querying when tracking is reported off', async () => {
      const { esClient, search } = createEs([taggedGate(1)]);

      const results = await run(
        build(esClient),
        workflowOutput({ token_usage_tracking_enabled: false })
      );

      expect(search).not.toHaveBeenCalled();
      for (const { result } of results) {
        expect(result.score).toBeNull();
        expect(result.label).toBe('unavailable');
        expect(result.explanation).toContain('genAiSettings:tokenUsageTracking');
      }
    });

    it('does not throw and reports unavailable on other search errors', async () => {
      const { esClient } = createEs(new Error('boom'));

      const results = await run(build(esClient), workflowOutput());

      for (const { result } of results) {
        expect(result.score).toBeNull();
        expect(result.label).toBe('unavailable');
        expect(result.explanation).toContain('boom');
      }
    });
  });

  it('flags truncation and logs a warning when the usage query hit the doc cap', async () => {
    const warning = jest.fn();
    const { esClient } = createEs([taggedGate(1)], { totalOverride: 25_000 });

    const results = await run(
      createAttackDiscoveryTokenUsageEvaluators({
        esClient,
        log: { warning, debug: jest.fn() } as unknown as ToolingLog,
        settle: { quietMs: 0, maxWaitMs: 0, pollIntervalMs: 1 },
        now: createClock().now,
        sleep: createClock().sleep,
      }),
      workflowOutput()
    );

    expect(results[0].result.metadata).toMatchObject({ truncated: true, total_hits: 25_000 });
    expect(warning).toHaveBeenCalledWith(expect.stringMatching(/truncated/i));
  });

  it('is not applicable, and does not query, for outputs without a workflow run window', async () => {
    const { esClient, search } = createEs([]);

    const results = await run(build(esClient), {
      insights: null,
      raw: { execution_uuid: 'x' },
    });

    expect(search).not.toHaveBeenCalled();
    for (const { result } of results) {
      expect(result.score).toBeNull();
      expect(result.label).toBe('not_applicable');
    }
  });
});
