/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client as EsClient } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import { readWorkflowAgentToolCalls } from './read_workflow_agent_tool_calls';

/**
 * Trace-schema drift guard.
 *
 * The whole routing/trajectory signal hangs on a handful of field names that live in another
 * team's telemetry: `attributes.gen_ai.conversation.id` for the join,
 * `attributes.elastic.inference.span.kind == "TOOL"` for the filter, and the `tool_id` /
 * `tool_failed` columns the parsers read back.
 *
 * None of those are typed. `parseToolIds` and `parseFailedToolIds` both resolve a column by name
 * and return `[]` when `findIndex` gives -1, so a renamed column does not raise — it silently
 * becomes "the agent called no tools", which Tool Routing scores as 0 ('missed'). Schema drift
 * therefore arrives as a *quality regression* rather than a harness failure, which is the most
 * expensive way to receive it: someone spends a day investigating why the agent stopped routing.
 *
 * These tests pin the query text and the parser contract so a drift shows up here, in CI, with the
 * field name in the failure message.
 */

const log = { warning: () => {}, info: () => {}, debug: () => {} } as unknown as ToolingLog;

/** Captures the ES|QL sent, and replays canned responses in order. */
const stubEs = (responses: Array<{ columns: Array<{ name: string }>; values: unknown[][] }>) => {
  const queries: string[] = [];
  let call = 0;
  const client = {
    esql: {
      query: async ({ query }: { query: string }) => {
        queries.push(query);
        return responses[Math.min(call++, responses.length - 1)];
      },
    },
  } as unknown as EsClient;
  return { client, queries };
};

const PROBE_HIT = { columns: [{ name: 'span_count' }], values: [[3]] };

/** Columns `parseToolIds` / `parseFailedToolIds` resolve by name. Must match the query's EVALs. */
const PARSED_COLUMNS = ['tool_id', 'tool_failed'];

const toolRows = (rows: Array<[string, boolean]>) => ({
  columns: [{ name: '@timestamp' }, { name: 'tool_id' }, { name: 'tool_failed' }],
  values: rows.map(([id, failed], i) => [i, id, failed]),
});

describe('readWorkflowAgentToolCalls — trace schema contract', () => {
  it('joins on gen_ai.conversation.id and filters to TOOL spans', async () => {
    const { client, queries } = stubEs([
      PROBE_HIT,
      toolRows([['security.create_detection_rule', false]]),
    ]);

    await readWorkflowAgentToolCalls({ traceEsClient: client, conversationId: 'conv-1', log });

    // Pinned deliberately: the join key is the fix that took routing from N/A on every example
    // to 7/7 resolved. A change here must be a conscious edit, not a silent one.
    expect(queries[0]).toContain('attributes.gen_ai.conversation.id == "conv-1"');
    expect(queries[1]).toContain('attributes.elastic.inference.span.kind == "TOOL"');
    expect(queries[1]).toContain('COALESCE(attributes.gen_ai.tool.name, name)');
  });

  it('reads tool ids and failure status from the response columns', async () => {
    const { client } = stubEs([
      PROBE_HIT,
      toolRows([
        ['load_skill', false],
        ['security.create_detection_rule', true],
      ]),
    ]);

    const result = await readWorkflowAgentToolCalls({
      traceEsClient: client,
      conversationId: 'conv-1',
      log,
    });

    expect(result.toolCallIds).toEqual(['load_skill', 'security.create_detection_rule']);
    expect(result.failedToolCallIds).toEqual(['security.create_detection_rule']);
    expect(result.unavailable).toBe(false);
  });

  it('bounds the tool query explicitly instead of inheriting the ES|QL row default', async () => {
    // ES|QL applies an implicit 1000-row cap when no LIMIT is given, and truncation is silent:
    // the tail of a long trajectory just disappears, and routing scores against a partial tool
    // sequence that still looks like a real measurement. The busiest conversation observed on the
    // golden cluster used 483 tool spans (2026-08-12), so the default is not far off live traffic.
    const { client, queries } = stubEs([PROBE_HIT, toolRows([['load_skill', false]])]);

    await readWorkflowAgentToolCalls({
      traceEsClient: client,
      conversationId: 'conv-1',
      log,
    });

    expect(queries[1]).toMatch(/\|\s*LIMIT\s+\d+/);
  });

  it('projects the exact column names the parsers read back', () => {
    // The parsers resolve columns by name and return [] when findIndex gives -1. So renaming the
    // projection alone — `EVAL tool_failed` -> `EVAL failed` — silently turns "this tool errored"
    // into "no tool errored", with no exception and no N/A.
    //
    // Asserting the parser against a hand-built response cannot catch that: the stub supplies the
    // columns, so it agrees with the parser no matter what the query projects. The query and the
    // parser have to be pinned to the SAME names for the guard to bite.
    const { client, queries } = stubEs([PROBE_HIT, toolRows([['load_skill', false]])]);

    return readWorkflowAgentToolCalls({
      traceEsClient: client,
      conversationId: 'conv-1',
      log,
    }).then(() => {
      for (const column of PARSED_COLUMNS) {
        expect(queries[1]).toContain(`EVAL ${column} =`);
        expect(queries[1]).toContain(column);
      }
      // KEEP must carry them through, or the response arrives without the columns.
      expect(queries[1]).toMatch(/\| KEEP .*tool_id.*tool_failed/);
    });
  });

  it('reports unavailable — not "no tools called" — when the probe finds no spans', async () => {
    // The distinction the whole suite rests on: absent measurement must not read as a clean run.
    //
    // A zero-span probe is retried (spans land asynchronously, so an early read is expected to
    // miss), which means this path deliberately costs ~5 retries with exponential backoff before
    // giving up. Real timers would make this a >60s test, so they are faked: the assertion is
    // about the *verdict*, not the wait.
    jest.useFakeTimers();
    const { client } = stubEs([{ columns: [{ name: 'span_count' }], values: [[0]] }]);

    const pending = readWorkflowAgentToolCalls({
      traceEsClient: client,
      conversationId: 'conv-1',
      log,
    });
    await jest.runAllTimersAsync();
    const result = await pending;
    jest.useRealTimers();

    expect(result.unavailable).toBe(true);
    expect(result.toolCallIds).toEqual([]);
  });

  it('reports unavailable when there is no trace client or conversation id', async () => {
    const { client } = stubEs([PROBE_HIT]);

    await expect(
      readWorkflowAgentToolCalls({ traceEsClient: undefined, conversationId: 'c', log })
    ).resolves.toMatchObject({ unavailable: true });

    await expect(
      readWorkflowAgentToolCalls({ traceEsClient: client, conversationId: undefined, log })
    ).resolves.toMatchObject({ unavailable: true });
  });

  it('excludes filestore.read noise from the tool list', async () => {
    const { client, queries } = stubEs([PROBE_HIT, toolRows([['load_skill', false]])]);

    await readWorkflowAgentToolCalls({ traceEsClient: client, conversationId: 'conv-1', log });

    expect(queries[1]).toContain('filestore.read');
  });
});
