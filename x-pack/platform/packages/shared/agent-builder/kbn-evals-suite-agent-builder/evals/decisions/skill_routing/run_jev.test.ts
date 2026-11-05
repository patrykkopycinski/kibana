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
import { loadCatalog } from './catalog';
import { ARMS, CHOICE_QUESTION, GATE_QUESTION, SKILL_ROUTING_PATH_ID } from './cascade';
import { buildRoutingReport, main, renderRoutingMarkdown, runJevViews } from './run_jev';

describe('skill routing run_jev', () => {
  let tmp: string;
  let repoRoot: string;
  let stdout: jest.SpyInstance;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-routing-'));
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-repo-'));
    stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdout.mockRestore();
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  // Picks the first listed skill and passes the gate unless the query reads as small talk.
  const transport: JevTransport = {
    async post(_url, body) {
      const { state, questions } = JSON.parse(body);
      const skills = Object.keys(questions[CHOICE_QUESTION].criteria);
      return {
        status: 200,
        headers: {},
        body: JSON.stringify({
          model: JEV_PINNED_MODEL,
          answers: {
            [GATE_QUESTION]: { type: 'noul', noul: /thank|hello|joke/i.test(state) ? 0.1 : 0.8 },
            [CHOICE_QUESTION]: {
              type: 'choice',
              choice: skills[0],
              confidence: 0.6,
              probabilities: { [skills[0]]: 0.6, [skills[1]]: 0.4 },
            },
          },
          usage: { input_tokens: 5000, output_tokens: 0 },
        }),
      };
    },
  };

  it('runs both views through the stub, one request per item, and reproduces the baselines', async () => {
    const catalog = loadCatalog();
    const client = createJevClient({
      pathId: SKILL_ROUTING_PATH_ID,
      transport,
      repoRoot,
      env: {
        JEV_ENABLED: '1',
        JEV_ENABLED_PATHS: SKILL_ROUTING_PATH_ID,
        JEV_CAPTURE_DIR: path.join(tmp, 'captures'),
        TYPESAFE_API_KEY: 'test-key-not-a-real-credential',
      },
    });
    const jev = await runJevViews(client, catalog);
    expect(jev.security).toHaveLength(71);
    expect(jev.full).toHaveLength(189);
    expect(fs.readdirSync(path.join(tmp, 'captures'))).toHaveLength((71 + 189) * 3);

    const report = buildRoutingReport(catalog, jev);
    const security = report.views.find(({ view }) => view === 'security');
    expect(security?.arms.map(({ arm }) => arm)).toContain(ARMS.jevCascade);
    expect(security?.decisions).toHaveLength(3);
    expect(report.outputResolution.security?.unresolved).toEqual([]);
    expect(renderRoutingMarkdown(report, { title: 't', provenance: [] })).toMatch(
      /Jev output names \(full\)/
    );

    const rawFile = path.join(tmp, 'raw.json');
    fs.writeFileSync(
      rawFile,
      JSON.stringify({ startedAt: '2026-11-05T00:00:00.000Z', requestedModel: 'jev', jev })
    );
    await main(['--recompute', rawFile], { SKILL_ROUTING_OUT: path.join(tmp, 'out') });
    expect(fs.readdirSync(path.join(tmp, 'out')).sort()).toEqual([
      'skill_routing_report_2026-11-05T00-00-00-000Z.json',
      'skill_routing_report_2026-11-05T00-00-00-000Z.md',
    ]);
  });

  it('runs offline with no request and asserts the frozen baselines', async () => {
    await expect(main(['--offline'], {})).resolves.toBeUndefined();
  });

  it('refuses a live run when the path is not enabled', async () => {
    await expect(main([], { JEV_ENABLED: '1', JEV_ENABLED_PATHS: 'OTHER' })).rejects.toThrow(
      /No request was made/
    );
  });

  it('refuses a live run without an output dir before any request', async () => {
    await expect(
      main([], { JEV_ENABLED: '1', JEV_ENABLED_PATHS: SKILL_ROUTING_PATH_ID })
    ).rejects.toThrow(/SKILL_ROUTING_OUT/);
  });
});
