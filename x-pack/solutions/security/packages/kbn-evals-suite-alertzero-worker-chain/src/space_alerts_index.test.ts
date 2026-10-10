/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  assertAlertsIndexMapping,
  ensureSpaceAlertsIndex,
  type AlertsIndexEsClient,
} from './space_alerts_index';

const ALIAS = '.alerts-security.alerts-alertzero-g20';

const esClientOf = ({
  exists,
  mapped = true,
}: {
  exists: () => boolean;
  mapped?: boolean;
}): AlertsIndexEsClient => ({
  indices: {
    exists: jest.fn(async () => exists()),
    getFieldMapping: jest.fn(async () => ({
      '.internal.alerts-security.alerts-alertzero-g20-000001': {
        mappings: mapped ? { 'kibana.alert.workflow_reason': { mapping: {} } } : {},
      },
    })),
  },
});

describe('assertAlertsIndexMapping', () => {
  it('passes when the alias maps kibana.alert.workflow_reason', async () => {
    await expect(
      assertAlertsIndexMapping(esClientOf({ exists: () => true }), 'alertzero-g20')
    ).resolves.toBeUndefined();
  });

  it('throws when the alias is an auto-created index without the mapping', async () => {
    await expect(
      assertAlertsIndexMapping(esClientOf({ exists: () => true, mapped: false }), 'alertzero-g20')
    ).rejects.toThrow('kibana.alert.workflow_reason');
  });

  it('throws when the alias does not exist', async () => {
    await expect(
      assertAlertsIndexMapping(esClientOf({ exists: () => false }), 'alertzero-g20')
    ).rejects.toThrow(`${ALIAS} does not exist`);
  });
});

describe('ensureSpaceAlertsIndex', () => {
  it('creates a bootstrap rule in the space, waits for the alias, then deletes the rule', async () => {
    let polls = 0;
    const esClient = esClientOf({ exists: () => polls++ >= 2 });
    const kbnRequest = jest.fn(async ({ method }: { method: string; path: string }) => ({
      statusCode: 200,
      body: method === 'POST' ? { id: 'rule-1' } : {},
    }));

    await ensureSpaceAlertsIndex({
      kbnRequest,
      esClient,
      spaceId: 'alertzero-g20',
      sleep: async () => undefined,
    });

    expect(kbnRequest.mock.calls.map(([r]) => `${r.method} ${r.path}`)).toEqual([
      'POST /api/detection_engine/rules',
      'DELETE /api/detection_engine/rules?id=rule-1',
    ]);
  });

  it('does nothing when the alias already exists, and for the default space', async () => {
    const kbnRequest = jest.fn();
    await ensureSpaceAlertsIndex({
      kbnRequest,
      esClient: esClientOf({ exists: () => true }),
      spaceId: 'alertzero-g20',
    });
    await ensureSpaceAlertsIndex({
      kbnRequest,
      esClient: esClientOf({ exists: () => false }),
      spaceId: 'default',
    });
    expect(kbnRequest).not.toHaveBeenCalled();
  });

  it('deletes the rule and throws when the alias never appears', async () => {
    const kbnRequest = jest.fn(async ({ method }: { method: string }) => ({
      statusCode: 200,
      body: method === 'POST' ? { id: 'rule-2' } : {},
    }));
    await expect(
      ensureSpaceAlertsIndex({
        kbnRequest,
        esClient: esClientOf({ exists: () => false }),
        spaceId: 'alertzero-g20',
        timeoutMs: -1,
        sleep: async () => undefined,
      })
    ).rejects.toThrow('did not install');
    expect(kbnRequest.mock.calls.map(([r]) => r.method)).toEqual(['POST', 'DELETE']);
  });

  it('throws when the bootstrap rule cannot be created', async () => {
    const kbnRequest = jest.fn(async () => ({ statusCode: 403, body: { message: 'no' } }));
    await expect(
      ensureSpaceAlertsIndex({
        kbnRequest,
        esClient: esClientOf({ exists: () => false }),
        spaceId: 'alertzero-g20',
      })
    ).rejects.toThrow('Could not create the alerts-index bootstrap rule');
  });
});
