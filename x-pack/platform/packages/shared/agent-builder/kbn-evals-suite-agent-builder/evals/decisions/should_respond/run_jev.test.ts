/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { JevTransport } from '../lib/jev_client';
import { createJevClient, JEV_PINNED_MODEL } from '../lib/jev_client';
import { loadShouldRespondExamples } from './dataset';
import { buildShouldRespondReport } from './report';
import { main, runJevArm, SHOULD_RESPOND_PATH_ID, toJevQuestions } from './run_jev';

describe('run_jev', () => {
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

  it('translates the plugin predicate into a Jev noul question with the same instructions', () => {
    const questions = toJevQuestions();
    expect(Object.keys(questions)).toEqual(['should_respond']);
    expect(questions.should_respond.type).toBe('noul');
    expect(questions.should_respond.instructions).toMatch(/shared conversation/);
  });

  it('runs every example through one batched request each and reports the whole population', async () => {
    const examples = loadShouldRespondExamples();
    // Stub that "answers" from the state text, so the pipeline runs with no network.
    const transport: JevTransport = {
      async post(_url, body) {
        const { state } = JSON.parse(body);
        const noul =
          /@(Observability Assistant|Security Analyst|Search Helper|Elastic AI Agent)/.test(state)
            ? 0.9
            : 0.2;
        return {
          status: 200,
          headers: {},
          body: JSON.stringify({
            model: JEV_PINNED_MODEL,
            answers: { should_respond: { type: 'noul', noul } },
            usage: { input_tokens: 300, output_tokens: 0 },
          }),
        };
      },
    };
    const client = createJevClient({
      pathId: SHOULD_RESPOND_PATH_ID,
      transport,
      repoRoot,
      env: {
        JEV_ENABLED: '1',
        JEV_ENABLED_PATHS: SHOULD_RESPOND_PATH_ID,
        JEV_CAPTURE_DIR: captureDir,
        TYPESAFE_API_KEY: 'test-key-not-a-real-credential',
      },
    });

    const predictions = await runJevArm(client, examples);
    expect(predictions).toHaveLength(examples.length);
    expect(fs.readdirSync(captureDir)).toHaveLength(examples.length * 3);

    const items = examples.map(({ output, metadata }) => ({
      id: metadata.id,
      label: output.shouldRespond,
      split: metadata.split,
      ambiguous: metadata.ambiguous,
    }));
    const report = buildShouldRespondReport(items, { stub: predictions });
    const { population } = report;
    expect(population.train + population.test + population.ambiguous).toBe(examples.length);
    expect(report.arms[0].usage.costUsdPerCall).toBeCloseTo((300 / 1e6) * 0.042, 10);
  });

  it('refuses to run when the path is not enabled', async () => {
    await expect(main({ JEV_ENABLED: '1', JEV_ENABLED_PATHS: 'OTHER' })).rejects.toThrow(
      /No request was made/
    );
  });

  it('adds the EIS arm only when the route is fully configured, without a TypeSafe key', async () => {
    const examples = loadShouldRespondExamples();
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-sr-out-'));
    // Both transports stubbed by spying on fetch: the direct arm must never fire (no key),
    // the EIS arm must fire once per example.
    const originalFetch = globalThis.fetch;
    let eisCalls = 0;
    let directCalls = 0;
    globalThis.fetch = (async (url) => {
      const target = String(url);
      if (target.includes('/_inference/decision/')) {
        eisCalls++;
        return new Response(
          JSON.stringify({
            decision: {
              answers: { should_respond: { type: 'predicate', probability: 0.8 } },
            },
          }),
          { status: 200 }
        );
      }
      directCalls++;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    try {
      await main({
        JEV_ENABLED: '1',
        JEV_ENABLED_PATHS: SHOULD_RESPOND_PATH_ID,
        JEV_CAPTURE_DIR: captureDir,
        SHOULD_RESPOND_OUT: outDir,
        TYPESAFE_API_KEY: undefined,
        JEV_EIS_URL: 'http://localhost:9220',
        JEV_EIS_AUTH_HEADER: 'Basic abc',
      });

      expect(eisCalls).toBe(examples.length);
      expect(directCalls).toBe(0);

      const reports = fs.readdirSync(outDir);
      expect(reports.filter((f) => f.endsWith('.json'))).toHaveLength(2);
      const report = JSON.parse(
        fs.readFileSync(
          path.join(outDir, reports.find((f) => f.startsWith('should_respond_report')) as string),
          'utf-8'
        )
      );
      const arms = report.arms.map(({ arm }: { arm: string }) => arm);
      expect(arms).toContain('jev via EIS (production route)');
      expect(arms).not.toContain('jev (production shouldRespondQuestions)');
      const markdown = fs.readFileSync(
        path.join(outDir, reports.find((f) => f.endsWith('.md')) as string),
        'utf-8'
      );
      expect(markdown).toMatch(/EIS production route/);
    } finally {
      globalThis.fetch = originalFetch;
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });
});
