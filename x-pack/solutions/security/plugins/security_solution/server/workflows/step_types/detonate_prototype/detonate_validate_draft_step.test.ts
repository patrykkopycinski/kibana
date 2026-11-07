/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under
 * one or more contributor license agreements. Licensed under the Elastic
 * License 2.0; you may not use this file except in compliance with the Elastic
 * License 2.0.
 */

import { detonateValidateDraftStepDefinition } from './detonate_validate_draft_step';
import { DETONATE_TRIAL_TAG } from '../../../../common/detonate_prototype';

type HandlerContext = Parameters<typeof detonateValidateDraftStepDefinition.handler>[0];

const RULE = {
  name: 'Suspicious curl pipe shell',
  description: 'Detects curl piped to shell.',
  query: 'FROM logs-* | WHERE process.command_line LIKE "*curl*"',
  language: 'esql',
  type: 'esql',
  interval: '10m',
  from: 'now-10m',
  to: 'null',
  severity: 'medium',
  risk_score: 40,
  threat: [],
  tags: ['detonate:draft'],
};

const createMockContext = (
  input: Record<string, unknown>,
  settingsBody: unknown = { settings: {} }
) =>
  ({
    input,
    contextManager: {
      callKibanaApi: jest.fn().mockResolvedValue({ status: 200, body: settingsBody }),
      getContext: () => ({ workflow: { spaceId: 'default' } }),
    },
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  } as unknown as HandlerContext);

/** A space that sets its own default index, as the demo space does. */
const SETTINGS_WITH_DEFAULT = {
  settings: { 'securitySolution:defaultIndex': { userValue: ['logs-*'] } },
};

describe('detonateValidateDraftStepDefinition', () => {
  it('validates a clean draft, injects the three tags and the trial schedule, and emits the sandbox query', async () => {
    const context = createMockContext(
      { rule: RULE, task_id: 'task-7', space_id: 'default' },
      SETTINGS_WITH_DEFAULT
    );

    const result = await detonateValidateDraftStepDefinition.handler(context);

    expect(result.output?.valid).toBe(true);
    const rule = result.output?.rule;
    expect(rule?.tags).toContain(DETONATE_TRIAL_TAG);
    expect(rule?.tags).toContain('detonate:task-7');
    expect(rule?.tags?.some((t) => t.startsWith('detonate:candidate:'))).toBe(true);
    expect(rule?.tags).toContain('detonate:draft');
    expect(rule?.interval).toBe('5m');
    expect(rule?.from).toBe('now-6m');
    expect(result.output?.sandbox_query).toContain('.kibana-detonate-sandbox-default');
    expect(result.output?.sandbox_query).toContain('"task-7"');
  });

  it('describes the candidate: production query, candidate tag, aggregation flag, source patterns', async () => {
    const context = createMockContext(
      { rule: RULE, task_id: 'task-7', space_id: 'default' },
      SETTINGS_WITH_DEFAULT
    );

    const result = await detonateValidateDraftStepDefinition.handler(context);
    const output = result.output ?? {};

    // The production variant reads the same sources with LIMIT removed and a
    // trailing count; the candidate tag is the one find_created_rule filters by.
    expect(output.production_query).toContain('FROM logs-*');
    expect(output.production_query).toContain('COUNT(*)');
    expect(String(output.production_query).toUpperCase()).not.toContain('LIMIT');
    expect(output.candidate_tag).toMatch(/^detonate:candidate:/);
    // A plain WHERE pipeline counts matching events, not would-alert groups.
    expect(output.aggregating).toBe(false);
    expect(output.source_patterns).toEqual(['logs-*']);
  });

  it('flags a trailing STATS … BY as aggregating, so the backtest says would-alert groups', async () => {
    const context = createMockContext(
      {
        rule: {
          ...RULE,
          query: 'FROM logs-* | STATS c = COUNT(*) BY host.name | SORT c DESC | LIMIT 5',
        },
        task_id: 'task-7',
        space_id: 'default',
      },
      SETTINGS_WITH_DEFAULT
    );

    const result = await detonateValidateDraftStepDefinition.handler(context);

    expect(result.output?.aggregating).toBe(true);
  });

  it('dedupes tags when the draft already carries one', async () => {
    const context = createMockContext(
      {
        rule: { ...RULE, tags: ['detonate:task-7'] },
        task_id: 'task-7',
        space_id: 'default',
      },
      SETTINGS_WITH_DEFAULT
    );

    const result = await detonateValidateDraftStepDefinition.handler(context);

    const tags = result.output?.rule?.tags ?? [];
    expect(tags.filter((t) => t === 'detonate:task-7')).toHaveLength(1);
  });

  it('falls back to the registered default when the space sets none, and rejects wildcard drafts fail-closed under it', async () => {
    const context = createMockContext({ rule: RULE, task_id: 't', space_id: 'default' });

    const result = await detonateValidateDraftStepDefinition.handler(context);

    expect(context.contextManager.callKibanaApi).toHaveBeenCalledWith({
      method: 'GET',
      path: '/api/kibana/settings',
    });
    // The registered default carries a -*elastic-cloud-logs-* exclusion entry,
    // and `logs-*` intersects it (witness logs-elastic-cloud-logs-x), so the
    // draft is rejected fail-closed. A demo space sets its own defaultIndex
    // without that exclusion.
    expect(result.output?.valid).toBe(false);
    expect(result.output?.skip_reason).toContain('exclusion');
  });

  it('uses the space userValue when set', async () => {
    const context = createMockContext(
      { rule: RULE, task_id: 't', space_id: 'default' },
      { settings: { 'securitySolution:defaultIndex': { userValue: ['filebeat-*'] } } }
    );

    const result = await detonateValidateDraftStepDefinition.handler(context);

    expect(result.output?.valid).toBe(false);
    expect(result.output?.skip_reason).toContain('logs-*');
  });

  it('rejects a draft whose query reaches the sandbox stream, without throwing', async () => {
    const context = createMockContext(
      {
        rule: { ...RULE, query: 'FROM .kibana-detonate-sandbox-default' },
        task_id: 't',
        space_id: 'default',
      },
      // The settings read happens before the query guard (the guard needs the
      // space defaultIndex), so mock it even though this rejection is
      // rule 4, not rule 6.
      SETTINGS_WITH_DEFAULT
    );

    const result = await detonateValidateDraftStepDefinition.handler(context);

    expect(result.output?.valid).toBe(false);
    expect(result.output?.skip_reason).toBeDefined();
  });

  it('rejects a non-ES|QL rule shape before parsing or reading settings', async () => {
    const context = createMockContext({
      rule: { ...RULE, type: 'kuery', language: 'kuery' },
      task_id: 't',
      space_id: 'default',
    });

    const result = await detonateValidateDraftStepDefinition.handler(context);

    expect(result.output?.valid).toBe(false);
    expect(context.contextManager.callKibanaApi).not.toHaveBeenCalled();
  });
});
