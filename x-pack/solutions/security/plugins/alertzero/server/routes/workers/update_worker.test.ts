/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import { httpServerMock, httpServiceMock } from '@kbn/core-http-server-mocks';
import { SYSTEM_SECURITY_WORKER_FLOOR_ALERT_TRIAGE_ID } from '@kbn/alertzero-common';
import { workerRegistry } from '../../managed_workflows/worker_registry';
import type { WorkerSettingsPatch } from '../../managed_workflows/workers/types';
import type { RouteDependencies } from '../register_routes';
import { registerUpdateWorkerRoute } from './update_worker';

const TRIAGE = SYSTEM_SECURITY_WORKER_FLOOR_ALERT_TRIAGE_ID;

const createHarness = (result: unknown) => {
  const router = httpServiceMock.createRouter();
  const addVersion = jest.fn();
  (router.versioned.patch as jest.Mock).mockReturnValue({ addVersion });
  const update = jest.fn().mockResolvedValue(result);

  registerUpdateWorkerRoute({
    router,
    logger: loggingSystemMock.createLogger(),
    getSpaceId: () => 'default',
    getWorkersService: () => ({ update }),
  } as unknown as RouteDependencies);

  // The first registered version is the one under test; it carries the OpenAPI validation.
  const registration = addVersion.mock.calls[0][0] as {
    validate?: { request?: { body?: { _sourceSchema?: unknown } } };
  };
  const handler = addVersion.mock.calls[0][1] as (
    context: unknown,
    request: ReturnType<typeof httpServerMock.createKibanaRequest>,
    response: ReturnType<typeof httpServerMock.createResponseFactory>
  ) => Promise<unknown>;

  return { handler, registration, update };
};

const invoke = async (
  handler: ReturnType<typeof createHarness>['handler'],
  body: Record<string, unknown>
) => {
  const response = httpServerMock.createResponseFactory();
  await handler(
    {},
    httpServerMock.createKibanaRequest({ params: { workerId: TRIAGE }, body }),
    response
  );
  return response;
};

describe('registerUpdateWorkerRoute', () => {
  it('maps unavailable to 503', async () => {
    const { handler } = createHarness({ outcome: 'unavailable' });

    const response = await invoke(handler, { enabled: true });

    expect(response.customError).toHaveBeenCalledWith({
      statusCode: 503,
      body: {
        message: 'Worker settings are temporarily unavailable; try again',
      },
    });
    expect(response.customError).not.toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 501 })
    );
  });

  // The rejection branch is what keeps post-MVP settings out of the durable managed-workflow
  // values, so its status mapping is a contract, not a cosmetic detail.
  it('maps rejected to 400 and names the rejected setting', async () => {
    const { handler, update } = createHarness({
      outcome: 'rejected',
      what: 'a schedule interval',
    });

    const response = await invoke(handler, {
      scheduleInterval: '15m',
      settingsRevision: 1,
    });

    expect(update).toHaveBeenCalledWith(TRIAGE, expect.objectContaining({ scheduleInterval: '15m' }), 'default', expect.anything());
    expect(response.badRequest).toHaveBeenCalledWith({
      body: {
        message: `Cannot apply a schedule interval to worker "${TRIAGE}"`,
      },
    });
    expect(response.ok).not.toHaveBeenCalled();
  });

  it('maps conflict to 409', async () => {
    const { handler } = createHarness({ outcome: 'conflict' });

    const response = await invoke(handler, { autonomyLevel: 'assisted', settingsRevision: 1 });

    expect(response.conflict).toHaveBeenCalledWith({
      body: {
        message: `Worker "${TRIAGE}" settings changed; reload and retry`,
      },
    });
  });
});

/*
 * The post-MVP settings seam, and why it deliberately carries no per-key rejection list.
 *
 * The guard is a PAIR and neither half may be made permissive:
 *   1. the request boundary strips — `UpdateWorkerRequestBody` is a `z.object`, so a key the
 *      schema does not declare never reaches the service at all;
 *   2. the patch type excludes — `WorkerSettingsPatch` names only `autonomyLevel` and
 *      `scheduleInterval`, so a post-MVP key cannot be named as a setting even in code.
 *
 * So there is no hand-written list of legacy key names asserted as "must be rejected" here:
 * pinning the names makes every legitimate new setting a spurious red and would forbid the schema
 * addition that is the *intended* way to ship one. The cases below assert the shape of the durable
 * values and the shape of the boundary, never the absence of one particular key name.
 *
 * Contrast with the guard this replaced (pnd `watch_settings.ts` at e3116230): five runtime key
 * checks — triggers, scopeRouting, approvalGate, worker, skill — because the body schema of that
 * day did not strip. `alertzero` validates the body with a stripping `z.object`, which is why those
 * branches are gone with their schema and why the patch type is now the load-bearing half.
 *
 * The five legacy shapes below are exercised through the patch type, which is where the durable
 * guarantee lives: `applyPatch` builds the next values from the current values plus the two keys
 * it names, so no extra key can be written however it is spelled.
 */
const LEGACY_SETTING_SHAPES: Array<[string, unknown]> = [
  ['approvalGate', { id: 'gate-1', requirement: 'always' }],
  ['scopeRouting', { dataSources: [] }],
  ['worker', { workerId: 'alert-correlation', enabled: false }],
  ['skill', { skillId: 'triage' }],
  ['triggers', [{ type: 'scheduled' }]],
];

const workerSettingsOf = (id: string) => {
  const registration = workerRegistry.get(id);
  if (!registration) throw new Error(`Worker "${id}" is not registered`);
  return registration.settings;
};

const bodySchemaOf = (registration: ReturnType<typeof createHarness>['registration']) =>
  registration.validate?.request?.body?._sourceSchema as
    | { safeParse: (input: unknown) => { success: boolean; data?: unknown } }
    | undefined;

describe('post-MVP settings seam', () => {
  it.each(LEGACY_SETTING_SHAPES)(
    'keeps an extra %s key out of the durable values',
    (key, value) => {
      const settings = workerSettingsOf(TRIAGE);

      const applied = settings.applyPatch(
        settings.createDefaultValues(),
        { [key]: value } as unknown as WorkerSettingsPatch
      );
      if (!('values' in applied)) throw new Error('Expected the extra key to be ignored');

      expect(Object.keys(applied.values).sort()).toEqual(['autonomyLevel', 'settingsVersion']);
      expect(applied.values).not.toHaveProperty(key);
    }
  );

  // Green on every legitimate schema addition: it names the keys the Worker owns rather than
  // enumerating the keys it must not own.
  it('keeps every settings key the request schema declares', async () => {
    const bodySchema = bodySchemaOf(createHarness({ outcome: 'unavailable' }).registration);
    expect(bodySchema).toBeDefined();

    const parsed = bodySchema!.safeParse({
      autonomyLevel: 'assisted',
      scheduleInterval: '15m',
      settingsRevision: 1,
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({
      autonomyLevel: 'assisted',
      scheduleInterval: '15m',
      settingsRevision: 1,
    });
  });

  // The stripping half of the pair, pinned with undeclarable key names so it cannot obstruct a
  // legitimate addition — no schema will ever declare `not-a-declared-setting-*`.
  it('strips keys the request schema does not declare', async () => {
    const bodySchema = bodySchemaOf(createHarness({ outcome: 'unavailable' }).registration);

    const parsed = bodySchema!.safeParse({
      settingsRevision: 1,
      'not-a-declared-setting-0': { id: 'gate-1' },
      'not-a-declared-setting-1': [{ type: 'scheduled' }],
      'not-a-declared-setting-2': 'legacy',
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ settingsRevision: 1 });
  });
});
