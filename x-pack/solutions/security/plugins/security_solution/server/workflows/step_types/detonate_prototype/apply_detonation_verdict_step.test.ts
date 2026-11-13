/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { applyDetonationVerdictStepDefinition } from './apply_detonation_verdict_step';
import { NOTE_URL } from '../../../../common/constants';
import { DETONATE_DECISIONS_PATH } from '../../../../common/detonate_prototype';

type HandlerContext = Parameters<typeof applyDetonationVerdictStepDefinition.handler>[0];

const createMockContext = (input: Record<string, unknown>) =>
  ({
    input,
    contextManager: {
      callKibanaApi: jest
        .fn()
        .mockResolvedValueOnce({ status: 200 })
        .mockResolvedValueOnce({ status: 200, body: { note: { noteId: 'note-7' } } }),
    },
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  } as unknown as HandlerContext);

const INPUT = {
  verdict: 'benign',
  alert_id: 'alert-9',
  task_id: 'task-1',
  evidence: 'Detonation completed and raised no alerts.',
};

describe('applyDetonationVerdictStepDefinition', () => {
  it('records the verdict as a decision and writes the evidence note', async () => {
    const context = createMockContext(INPUT);

    const result = await applyDetonationVerdictStepDefinition.handler(context);
    const calls = (context.contextManager.callKibanaApi as jest.Mock).mock.calls;

    expect(calls[0][0]).toStrictEqual({
      method: 'POST',
      path: DETONATE_DECISIONS_PATH,
      headers: { 'elastic-api-version': '1' },
      body: {
        decisions: [
          { alert_id: 'alert-9', state: 'verdict_applied', verdict: 'benign', task_id: 'task-1' },
        ],
      },
    });
    expect(calls[1][0]).toEqual({
      method: 'PATCH',
      path: NOTE_URL,
      body: {
        note: {
          note: expect.stringContaining('[detonate] Detonation completed and raised no alerts.'),
          eventId: 'alert-9',
          timelineId: '',
        },
      },
    });
    expect(result.output).toMatchObject({
      success: true,
      decision: 'verdict_applied',
      note_id: 'note-7',
    });
  });

  it('never calls an alert-status route', async () => {
    const context = createMockContext(INPUT);

    await applyDetonationVerdictStepDefinition.handler(context);

    const paths = (context.contextManager.callKibanaApi as jest.Mock).mock.calls.map(
      (call) => call[0].path as string
    );
    expect(paths.some((p) => /status|close|open/i.test(p))).toBe(false);
  });

  it('never modifies the alert document through the detection-engine tags route', async () => {
    const context = createMockContext(INPUT);

    await applyDetonationVerdictStepDefinition.handler(context);

    const paths = (context.contextManager.callKibanaApi as jest.Mock).mock.calls.map(
      (call) => call[0].path as string
    );
    expect(paths.some((p) => /signals\/tags|alert_tags/.test(p))).toBe(false);
    // Negative control for the check above: the source must not name the route at all.
    const dir = __dirname;
    const offenders = readdirSync(dir)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
      .filter((file) =>
        readFileSync(join(dir, file), 'utf8').includes('DETECTION_ENGINE_ALERT_TAGS_URL')
      );
    expect(offenders).toEqual([]);
  });

  it('still succeeds when the note write returns no noteId', async () => {
    const context = createMockContext(INPUT);
    (context.contextManager.callKibanaApi as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce({ status: 200 })
      .mockResolvedValueOnce({ status: 200, body: {} });

    const result = await applyDetonationVerdictStepDefinition.handler(context);
    expect(result.output).toMatchObject({ success: true, decision: 'verdict_applied' });
  });

  it('wraps failures in an execution error', async () => {
    const context = createMockContext(INPUT);
    (context.contextManager.callKibanaApi as jest.Mock)
      .mockReset()
      .mockRejectedValue(new Error('boom'));

    // toApiExecutionError rethrows the service's message inside an
    // ExecutionError — the step adds no wording of its own.
    await expect(applyDetonationVerdictStepDefinition.handler(context)).rejects.toThrow(/boom/);
  });
});
