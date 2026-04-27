/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

const log = {
  info: (msg: string) => process.stderr.write(`[evals-local] ${msg}\n`),
  warn: (msg: string) => process.stderr.write(`[evals-local] WARN: ${msg}\n`),
};

/**
 * Validate that a local model supports tool/function calling by sending a test request.
 * Returns true if the model can produce structured tool call responses.
 */
export async function validateToolCalling(endpoint: string): Promise<boolean> {
  const chatUrl = endpoint.endsWith('/v1')
    ? `${endpoint}/chat/completions`
    : `${endpoint}/v1/chat/completions`;

  const testRequest = {
    model: '',
    messages: [
      {
        role: 'user',
        content: 'What is 2 + 2? Use the answer tool to respond.',
      },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'answer',
          description: 'Provide the answer',
          parameters: {
            type: 'object',
            properties: {
              result: { type: 'number', description: 'The numeric result' },
            },
            required: ['result'],
          },
        },
      },
    ],
    tool_choice: { type: 'function', function: { name: 'answer' } },
    max_tokens: 100,
    temperature: 0,
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);

    const response = await fetch(chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer local-eval' },
      body: JSON.stringify(testRequest),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      log.warn(`Tool calling validation failed: HTTP ${response.status}`);
      return false;
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          tool_calls?: Array<{
            function?: { name: string; arguments?: string };
          }>;
        };
      }>;
    };

    const toolCalls = data.choices?.[0]?.message?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      log.warn('Model responded but did not produce tool calls.');
      return false;
    }

    const call = toolCalls[0];
    if (call.function?.name === 'answer') {
      try {
        const args = JSON.parse(call.function.arguments ?? '{}');
        if (typeof args.result === 'number') {
          log.info(`Tool calling validated: model returned result=${args.result}`);
          return true;
        }
      } catch {
        // JSON parse failed
      }
    }

    log.warn('Model produced tool calls but with unexpected format.');
    return false;
  } catch (e) {
    log.warn(`Tool calling validation error: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}
