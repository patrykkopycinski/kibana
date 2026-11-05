/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { JevQuestion, JevTransport, TransportResponse } from './jev_client';
import {
  createEisTransport,
  createJevClient,
  JEV_PINNED_MODEL,
  JevError,
  jevState,
  keyFingerprint,
  MAX_JEV_CONCURRENCY,
  resolveCaptureDir,
} from './jev_client';

const FAKE_KEY = 'test-key-not-a-real-credential';
const PATH_ID = 'AB-SHOULD-RESPOND';
const QUESTIONS = { should_respond: { type: 'noul' as const, instructions: 'Should it respond?' } };

const okBody = JSON.stringify({
  model: JEV_PINNED_MODEL,
  answers: { should_respond: { type: 'noul', noul: 0.8 } },
  usage: { input_tokens: 120, output_tokens: 5 },
});

const recordingTransport = (responses: TransportResponse[] = []) => {
  const calls: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
  const transport: JevTransport = {
    async post(url, body, headers) {
      calls.push({ url, body, headers });
      return responses.shift() ?? { status: 200, body: okBody, headers: {} };
    },
  };
  return { transport, calls };
};

describe('jev_client', () => {
  let captureDir: string;
  let repoRoot: string;

  beforeEach(() => {
    captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-captures-'));
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-repo-'));
  });

  afterEach(() => {
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  const enabledEnv = (): NodeJS.ProcessEnv => ({
    JEV_ENABLED: '1',
    JEV_ENABLED_PATHS: PATH_ID,
    JEV_CAPTURE_DIR: captureDir,
    TYPESAFE_API_KEY: FAKE_KEY,
  });

  it.each([
    ['global switch off', { JEV_ENABLED: '0' }],
    ['global switch unset', { JEV_ENABLED: undefined }],
    ['path not allowlisted', { JEV_ENABLED_PATHS: 'AB-SKILL-ROUTING' }],
    ['allowlist empty', { JEV_ENABLED_PATHS: '' }],
    ['no capture dir', { JEV_CAPTURE_DIR: undefined }],
  ])('makes zero requests when %s', async (_name, override) => {
    const { transport, calls } = recordingTransport();
    const client = createJevClient({
      pathId: PATH_ID,
      transport,
      env: { ...enabledEnv(), ...override },
      repoRoot,
    });
    await expect(client.ask('state', QUESTIONS, 'x')).rejects.toMatchObject({ code: 'disabled' });
    expect(calls).toHaveLength(0);
  });

  it('fails closed without a key on the direct transport, before any request', async () => {
    // The default transport is the real network one; the missing key must stop it first.
    const client = createJevClient({
      pathId: PATH_ID,
      env: { ...enabledEnv(), TYPESAFE_API_KEY: undefined },
      repoRoot,
    });
    await expect(client.ask('state', QUESTIONS, 'x')).rejects.toMatchObject({
      code: 'disabled',
      message: expect.stringContaining('TYPESAFE_API_KEY'),
    });
  });

  it('runs without a TypeSafe key when a custom transport owns its own auth', async () => {
    const { transport, calls } = recordingTransport();
    const client = createJevClient({
      pathId: PATH_ID,
      transport,
      env: { ...enabledEnv(), TYPESAFE_API_KEY: undefined },
      repoRoot,
    });
    const result = await client.ask('state', QUESTIONS, 'x');
    expect(calls).toHaveLength(1);
    expect(result.answers.should_respond).toEqual({ type: 'noul', noul: 0.8 });
    expect(calls[0].headers.Authorization).toBeUndefined();
  });

  it('refuses a capture dir inside the repository', () => {
    expect(() =>
      resolveCaptureDir({ JEV_CAPTURE_DIR: path.join(repoRoot, 'captures') }, repoRoot)
    ).toThrow(JevError);
    expect(() =>
      resolveCaptureDir({ JEV_CAPTURE_DIR: path.join(repoRoot, 'captures') }, repoRoot)
    ).toThrow(/outside the repository/);
  });

  it('allowlist matching is case-insensitive and comma separated', () => {
    expect(
      jevState(PATH_ID, { JEV_ENABLED: '1', JEV_ENABLED_PATHS: 'x, ab-should-respond' }).enabled
    ).toBe(true);
  });

  it('sends one batched request with the pinned model and captures it without the key', async () => {
    const { transport, calls } = recordingTransport();
    const client = createJevClient({ pathId: PATH_ID, transport, env: enabledEnv(), repoRoot });
    const result = await client.ask('the state', QUESTIONS, 'item-1');

    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].body)).toEqual({
      model: JEV_PINNED_MODEL,
      state: 'the state',
      questions: QUESTIONS,
    });
    expect(result).toMatchObject({ inputTokens: 120, outputTokens: 5, attempts: 1 });
    expect(result.answers.should_respond).toEqual({ type: 'noul', noul: 0.8 });

    const files = fs.readdirSync(captureDir).sort();
    expect(files).toEqual([
      `${PATH_ID}-item-1.body.json`,
      `${PATH_ID}-item-1.meta.json`,
      `${PATH_ID}-item-1.payload.json`,
    ]);
    for (const file of files) {
      expect(fs.readFileSync(path.join(captureDir, file), 'utf-8')).not.toContain(FAKE_KEY);
    }
    const meta = JSON.parse(
      fs.readFileSync(path.join(captureDir, `${PATH_ID}-item-1.meta.json`), 'utf-8')
    );
    expect(meta.keyFingerprint).toBe(keyFingerprint(FAKE_KEY));
  });

  it('retries 429 and 529, then succeeds', async () => {
    const { transport, calls } = recordingTransport([
      { status: 429, body: '{}', headers: {} },
      { status: 529, body: '{}', headers: {} },
    ]);
    const client = createJevClient({
      pathId: PATH_ID,
      transport,
      env: enabledEnv(),
      repoRoot,
      backoffMs: 1,
    });
    const result = await client.ask('s', QUESTIONS, 'retry');
    expect(calls).toHaveLength(3);
    expect(result.attempts).toBe(3);
  });

  it('does not retry auth failures', async () => {
    const { transport, calls } = recordingTransport([{ status: 401, body: '{}', headers: {} }]);
    const client = createJevClient({
      pathId: PATH_ID,
      transport,
      env: enabledEnv(),
      repoRoot,
      backoffMs: 1,
    });
    await expect(client.ask('s', QUESTIONS, 'auth')).rejects.toMatchObject({ code: 'auth' });
    expect(calls).toHaveLength(1);
  });

  it('rejects an answer of the wrong type', async () => {
    const wrong = JSON.stringify({
      model: 'm',
      answers: { should_respond: { type: 'choice', choice: 'a' } },
    });
    const { transport } = recordingTransport([{ status: 200, body: wrong, headers: {} }]);
    const client = createJevClient({ pathId: PATH_ID, transport, env: enabledEnv(), repoRoot });
    await expect(client.ask('s', QUESTIONS, 'wrong')).rejects.toThrow(/expected \[noul\]/);
  });

  it(`never has more than ${MAX_JEV_CONCURRENCY} requests in flight`, async () => {
    let inFlight = 0;
    let peak = 0;
    const transport: JevTransport = {
      async post() {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
        return { status: 200, body: okBody, headers: {} };
      },
    };
    const client = createJevClient({ pathId: PATH_ID, transport, env: enabledEnv(), repoRoot });
    await Promise.all(Array.from({ length: 30 }, (_, i) => client.ask('s', QUESTIONS, `c${i}`)));
    expect(peak).toBe(MAX_JEV_CONCURRENCY);
  });

  describe('createEisTransport', () => {
    const ROUTING_QUESTIONS: Record<string, JevQuestion> = {
      any_skill_applies: {
        type: 'noul',
        instructions: 'The message asks for work that needs a specialised skill.',
        criteria: {
          true: 'A concrete task on Elastic data or features.',
          false: 'Small talk or general knowledge.',
        },
      },
      skill: {
        type: 'choice',
        instructions: 'Which skill should the agent load?',
        criteria: { 'alert-analysis': 'Investigate security alerts', 'slack-lookup': null },
      },
    };

    const eisBody = JSON.stringify({
      decision: {
        answers: {
          any_skill_applies: { type: 'predicate', probability: 0.73 },
          skill: {
            type: 'choice',
            choice: 'alert-analysis',
            confidence: 0.6,
            probabilities: [
              { value: 'alert-analysis', probability: 0.8 },
              { value: 'slack-lookup', probability: 0.2 },
            ],
          },
        },
      },
    });

    it('translates the direct payload to the ES decision wire and the answers back', async () => {
      let posted!: { url: string; body: Record<string, unknown>; headers: Record<string, string> };
      const transport = createEisTransport({
        url: 'http://localhost:9220',
        inferenceId: '.typesafe-jev-1.13_decision',
        authHeaders: { Authorization: 'Basic abc' },
      });
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (url, init) => {
        posted = {
          url: String(url),
          body: JSON.parse(String(init?.body)),
          headers: init?.headers as Record<string, string>,
        };
        return new Response(eisBody, { status: 200 });
      }) as typeof fetch;
      try {
        const response = await transport.post(
          'https://api.typesafe.ai/v1/systemone',
          JSON.stringify({ model: 'jev-1.13.0', state: 'the state', questions: ROUTING_QUESTIONS }),
          { 'Content-Type': 'application/json', Authorization: 'Bearer direct-key' }
        );

        expect(posted.url).toBe(
          'http://localhost:9220/_inference/decision/.typesafe-jev-1.13_decision'
        );
        expect(posted.body.input).toBe('the state');
        const questions = (posted.body.task_settings as { questions: Record<string, unknown> })
          .questions;
        // predicate carries no criteria on the ES wire; they fold into the instructions.
        expect(questions.any_skill_applies).toEqual({
          type: 'predicate',
          instructions: expect.stringContaining('Answer true when: A concrete task'),
        });
        expect(questions.skill).toEqual({
          type: 'choice',
          instructions: 'Which skill should the agent load?',
          choices: { 'alert-analysis': 'Investigate security alerts', 'slack-lookup': '' },
        });
        // The ES auth wins over any direct-API header; the direct credential never leaks.
        expect(posted.headers.Authorization).toBe('Basic abc');
        expect(JSON.stringify(posted.body)).not.toContain('direct-key');

        expect(response.status).toBe(200);
        const parsed = JSON.parse(response.body);
        expect(parsed.answers.any_skill_applies).toEqual({ type: 'noul', noul: 0.73 });
        expect(parsed.answers.skill).toEqual({
          type: 'choice',
          choice: 'alert-analysis',
          confidence: 0.6,
          probabilities: { 'alert-analysis': 0.8, 'slack-lookup': 0.2 },
        });
        // The production wire body is preserved for captures.
        expect(parsed.source_body.decision.answers.skill.choice).toBe('alert-analysis');
        expect(parsed.model).toBe('.typesafe-jev-1.13_decision');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('passes the ES error body through untranslated on failure', async () => {
      const transport = createEisTransport({
        url: 'http://localhost:9220',
        inferenceId: 'missing',
        authHeaders: {},
      });
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ error: { type: 'resource_not_found_exception' } }), {
          status: 404,
        })) as typeof fetch;
      try {
        const response = await transport.post(
          'https://api.typesafe.ai/v1/systemone',
          JSON.stringify({ model: 'm', state: 's', questions: ROUTING_QUESTIONS }),
          {}
        );
        expect(response.status).toBe(404);
        expect(response.body).toContain('resource_not_found_exception');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
