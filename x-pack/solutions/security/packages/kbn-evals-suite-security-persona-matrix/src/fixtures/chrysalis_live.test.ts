/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable no-console -- Print live smoke counts to the test log. */
import { Client as EsClient } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import { PARITY_DOCS } from './chrysalis_parity_docs';
import { seedPersonaMatrixTools, cleanupPersonaMatrixTools } from './persona_matrix_tools_seed';

const loadParityFixture = (): typeof import('./chrysalis_seed') => {
  const previousProfile = process.env.SEED_PROFILE;
  process.env.SEED_PROFILE = 'parity';
  try {
    let loaded: typeof import('./chrysalis_seed') | undefined;
    jest.isolateModules(() => {
      loaded = jest.requireActual<typeof import('./chrysalis_seed')>('./chrysalis_seed');
    });
    if (!loaded) {
      throw new Error('Chrysalis parity fixture failed to load');
    }
    return loaded;
  } finally {
    if (previousProfile === undefined) {
      delete process.env.SEED_PROFILE;
    } else {
      process.env.SEED_PROFILE = previousProfile;
    }
  }
};

it('loads the parity fixture independently of the ambient profile', () => {
  const previousProfile = process.env.SEED_PROFILE;
  try {
    for (const ambient of [undefined, 'minimal']) {
      if (ambient === undefined) {
        delete process.env.SEED_PROFILE;
      } else {
        process.env.SEED_PROFILE = ambient;
      }
      expect(loadParityFixture().seedProfile).toBe('parity');
      expect(process.env.SEED_PROFILE).toBe(ambient);
    }
  } finally {
    if (previousProfile === undefined) {
      delete process.env.SEED_PROFILE;
    } else {
      process.env.SEED_PROFILE = previousProfile;
    }
  }
});

const run = process.env.PERSONA_MATRIX_LIVE_ES === 'http://127.0.0.1:19220' ? it : it.skip;

run(
  'dedicated Elasticsearch: foreign telemetry survives parity seed, lookup, cleanup, and reseed',
  async () => {
    const { seedChrysalisAlerts, cleanupChrysalisAlerts, seedProfile } = loadParityFixture();
    expect(seedProfile).toBe('parity');
    const esClient = new EsClient({
      node: process.env.PERSONA_MATRIX_LIVE_ES,
      auth: { username: 'elastic', password: 'changeme' },
    });
    const log = { info: console.log, warning: console.warn } as unknown as ToolingLog;
    const foreignIndex = 'logs-endpoint.events.process-default';
    const foreignId = `foreign-${Date.now()}`;
    const count = async (index: string, simulation: string) =>
      (
        await esClient.count({
          index,
          query: {
            term: {
              [index === 'on-call-schedule' ? 'labels.simulation.keyword' : 'labels.simulation']:
                simulation,
            },
          },
        })
      ).count;
    const groups = [...new Set(PARITY_DOCS.map(({ index }) => index))];
    const queries: Record<string, string> = {};
    const kbnClient = {
      request: async ({
        method,
        body,
      }: {
        method: string;
        body?: { id: string; configuration: { query: string } };
      }) => {
        if (method === 'POST' && body) queries[body.id] = body.configuration.query;
        return {};
      },
    } as unknown as Parameters<typeof seedPersonaMatrixTools>[0]['kbnClient'];
    try {
      await esClient.index({
        index: foreignIndex,
        id: foreignId,
        op_type: 'create',
        refresh: 'wait_for',
        document: {
          '@timestamp': new Date().toISOString(),
          event: { kind: 'event' },
          host: { name: 'foreign' },
        },
      });
      console.log(
        `foreign-before=${
          (await esClient.search({ index: foreignIndex, query: { ids: { values: [foreignId] } } }))
            .hits.hits.length
        }`
      );
      await seedChrysalisAlerts({ esClient, log });
      await seedPersonaMatrixTools({ kbnClient, log, parity: true });
      for (const id of ['vt.hash.lookup', 'check.on.call.schedule', 'get.time', 'create.channel']) {
        const response = await esClient.esql.query({ query: queries[id] });
        console.log(`shim ${id} rows=${response.values.length}`);
        expect(response.values.length).toBeGreaterThan(0);
      }
      await cleanupChrysalisAlerts({ esClient, log });
      const after = await Promise.all(
        groups.map(async (index) => [index, await count(index, 'chrysalis-sim')])
      );
      console.log(`seeded-after-cleanup=${JSON.stringify(after)}`);
      expect(after.every(([, total]) => total === 0)).toBe(true);
      console.log(
        `foreign-after=${
          (await esClient.search({ index: foreignIndex, query: { ids: { values: [foreignId] } } }))
            .hits.hits.length
        }`
      );
      expect(
        (await esClient.search({ index: foreignIndex, query: { ids: { values: [foreignId] } } }))
          .hits.hits
      ).toHaveLength(1);
      await seedChrysalisAlerts({ esClient, log });
      const reseed = await Promise.all(
        groups.map(async (index) => [index, await count(index, 'chrysalis-sim')])
      );
      console.log(
        `reseed=${JSON.stringify(reseed)} total=${reseed.reduce(
          (sum, [, total]) => sum + Number(total),
          0
        )}`
      );
      expect(reseed.reduce((sum, [, total]) => sum + Number(total), 0)).toBe(97);
    } finally {
      await cleanupChrysalisAlerts({ esClient, log });
      await cleanupPersonaMatrixTools({ kbnClient, log });
      await esClient
        .delete({ index: foreignIndex, id: foreignId, refresh: 'wait_for' })
        .catch(() => {});
      await esClient.close();
    }
  },
  180000
);
