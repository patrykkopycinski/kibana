/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { JevTransport, TransportResponse } from './jev_client';
import {
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
    ['no key', { TYPESAFE_API_KEY: undefined }],
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
});
