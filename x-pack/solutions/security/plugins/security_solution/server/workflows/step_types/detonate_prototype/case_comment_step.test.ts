/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { caseCommentStepDefinition } from './case_comment_step';

type HandlerContext = Parameters<typeof caseCommentStepDefinition.handler>[0];

const createMockContext = (body: Record<string, unknown>) =>
  ({
    input: { case_id: 'case-3', comment: 'Detonation verdict: malicious — 2 alerts.' },
    contextManager: {
      callKibanaApi: jest.fn().mockResolvedValue({
        status: 200,
        body: { comments: [{ id: 'old-1' }, { id: 'comment-9' }] },
      }),
    },
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  } as unknown as HandlerContext);

describe('caseCommentStepDefinition', () => {
  it('posts one user comment to the case comments route', async () => {
    const context = createMockContext({});

    const result = await caseCommentStepDefinition.handler(context);
    const calls = (context.contextManager.callKibanaApi as jest.Mock).mock.calls;

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual({
      method: 'POST',
      path: '/api/cases/case-3/comments',
      body: {
        comment: 'Detonation verdict: malicious — 2 alerts.',
        type: 'user',
        owner: 'securitySolution',
      },
    });
    expect(result.output).toMatchObject({ success: true, comment_id: 'comment-9' });
  });

  it('succeeds without a comment_id when the response has no comments array', async () => {
    const context = createMockContext({});
    (context.contextManager.callKibanaApi as jest.Mock)
      .mockReset()
      .mockResolvedValue({ status: 200, body: {} });

    const result = await caseCommentStepDefinition.handler(context);

    expect(result.output).toMatchObject({
      success: true,
      message: expect.stringContaining('case-3'),
    });
    expect(result.output?.comment_id).toBeUndefined();
  });

  it('wraps Kibana API failures in an execution error naming the action', async () => {
    const context = createMockContext({});
    (context.contextManager.callKibanaApi as jest.Mock)
      .mockReset()
      .mockRejectedValue(new Error('case not found'));

    await expect(caseCommentStepDefinition.handler(context)).rejects.toThrow('case not found');
  });
});
