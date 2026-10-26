/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { applyDetonationVerdictStepDefinition } from './apply_detonation_verdict_step';
import { DETECTION_ENGINE_ALERT_TAGS_URL, NOTE_URL } from '../../../../common/constants';

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
  verdict: 'quiet',
  alert_id: 'alert-9',
  task_id: 'task-1',
  evidence: 'Detonation completed and raised no alerts.',
};

describe('applyDetonationVerdictStepDefinition', () => {
  it('writes the detonate:<verdict> tag and the evidence note', async () => {
    const context = createMockContext(INPUT);

    const result = await applyDetonationVerdictStepDefinition.handler(context);
    const calls = (context.contextManager.callKibanaApi as jest.Mock).mock.calls;

    expect(calls[0][0]).toEqual({
      method: 'POST',
      path: DETECTION_ENGINE_ALERT_TAGS_URL,
      body: { ids: ['alert-9'], tags: { tags_to_add: ['detonate:quiet'] } },
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
      tag: 'detonate:quiet',
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

  it('still succeeds when the note write returns no noteId', async () => {
    const context = createMockContext(INPUT);
    (context.contextManager.callKibanaApi as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce({ status: 200 })
      .mockResolvedValueOnce({ status: 200, body: {} });

    const result = await applyDetonationVerdictStepDefinition.handler(context);
    expect(result.output).toMatchObject({ success: true, tag: 'detonate:quiet' });
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
