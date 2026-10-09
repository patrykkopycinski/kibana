/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { REPO_ROOT } from '@kbn/repo-info';
import type { HttpHandler } from '@kbn/core/public';
import type { Client as EsClient } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import {
  getManagedWorkflowDefinition,
  ALERTZERO_COVERAGE_REVIEW_WORKFLOW_ID,
  ALERTZERO_COVERAGE_WORKER_WORKFLOW_ID,
} from '@kbn/workflows/managed';
import {
  COVERAGE_BACKING_INDEX,
  COVERAGE_WORKER_ID,
  DRAFT_STEP_ID,
  EVAL_SPACE_ID,
  PROPOSE_STEP_ID,
  RULE_CREATION_WORKFLOW_ID,
  RUN_RULE_CREATION_STEP_ID,
  SERVICE_ACCOUNT_ENV,
} from './constants';
import {
  BINDING_GUARD_MESSAGE,
  GLOBAL_WORKFLOW_SPACE_ID,
  REQUIRED_STEP_IDS,
  assertRuleCreationInheritedIdentity,
  assertServiceAccountBindable,
  assertWorkflowInstalled,
  bindCoverageWorker,
  resolveCoverageServiceAccountId,
  seedCoverageIndicator,
} from './workflow_fixture';

const log = { info: jest.fn(), debug: jest.fn(), warning: jest.fn() } as unknown as ToolingLog;

const MANAGED_DEFS = 'src/platform/packages/shared/kbn-workflows/managed/definitions/alertzero';

const definitionYaml = (id: string): string => {
  const definition = getManagedWorkflowDefinition(id);
  if (!definition?.yaml) throw new Error(`${id} is not a managed workflow with yaml`);
  return definition.yaml;
};

const stepBlock = (yaml: string, stepName: string): string => {
  const lines = yaml.split('\n');
  const start = lines.findIndex((line) => line.includes(`name: ${stepName}`));
  return lines.slice(start, start + 12).join('\n');
};

const fetchReturning = (yaml: string) => jest.fn(async () => ({ yaml })) as unknown as HttpHandler;

describe('rule-creation workflow contract', () => {
  it('addresses steps that the shipped managed workflow declares', async () => {
    await expect(
      assertWorkflowInstalled({
        fetch: fetchReturning(definitionYaml(RULE_CREATION_WORKFLOW_ID)),
        log,
      })
    ).resolves.toBeDefined();
  });

  it('pins the draft and proposal steps by id', () => {
    expect([...REQUIRED_STEP_IDS]).toEqual([DRAFT_STEP_ID, PROPOSE_STEP_ID]);
  });

  it('fails setup when a required step is renamed in the workflow', async () => {
    const renamed = definitionYaml(RULE_CREATION_WORKFLOW_ID).replace(
      `- name: ${PROPOSE_STEP_ID}`,
      '- name: some_other_step'
    );
    await expect(assertWorkflowInstalled({ fetch: fetchReturning(renamed), log })).rejects.toThrow(
      PROPOSE_STEP_ID
    );
  });
});

/**
 * Where each workflow of the chain is installed, from the shipped definitions: `static` managed
 * workflows are installed once for every space (global `*`), `dynamic` Worker workflows are
 * installed per space (`<workerId>-<space>`).
 */
const installSpaceOf = (managedId: string): string => {
  const definition = getManagedWorkflowDefinition(managedId);
  if (!definition) throw new Error(`${managedId} is not a managed workflow`);
  return definition.management.lifecycle === 'static' ? GLOBAL_WORKFLOW_SPACE_ID : EVAL_SPACE_ID;
};

describe('binding guard (product copy)', () => {
  const guardSource = readFileSync(
    join(
      REPO_ROOT,
      'src/platform/plugins/shared/workflows_management/server/services/workflow_service_account_binding.ts'
    ),
    'utf8'
  );

  it('still matches workflow_service_account_binding.ts (drift pin)', () => {
    expect(guardSource).toContain(`spaceId === GLOBAL_WORKFLOW_SPACE_ID`);
    expect(guardSource).toContain(BINDING_GUARD_MESSAGE);
    expect(GLOBAL_WORKFLOW_SPACE_ID).toBe('*');
  });

  it('rejects a binding on a global workflow and allows a space-scoped one', () => {
    expect(() => assertServiceAccountBindable('*')).toThrow(BINDING_GUARD_MESSAGE);
    expect(() => assertServiceAccountBindable('default')).not.toThrow();
  });

  it('installs the Worker per space and everything below it globally', () => {
    expect(installSpaceOf(COVERAGE_WORKER_ID)).toBe(EVAL_SPACE_ID);
    expect(installSpaceOf(ALERTZERO_COVERAGE_WORKER_WORKFLOW_ID)).toBe('*');
    expect(installSpaceOf(ALERTZERO_COVERAGE_REVIEW_WORKFLOW_ID)).toBe('*');
    expect(installSpaceOf(RULE_CREATION_WORKFLOW_ID)).toBe('*');
  });

  it('would reject the 99ad8f48e design: a run_as/binding on global rule_creation is a 400', () => {
    expect(() => assertServiceAccountBindable(installSpaceOf(RULE_CREATION_WORKFLOW_ID))).toThrow(
      BINDING_GUARD_MESSAGE
    );
  });
});

describe('production chain shape the fixture relies on', () => {
  it('keeps rule_creation unbound and reached by inherit through coverage_review', () => {
    expect(definitionYaml(RULE_CREATION_WORKFLOW_ID)).not.toMatch(/^ {2}run_as:/m);
    const block = stepBlock(
      definitionYaml(ALERTZERO_COVERAGE_REVIEW_WORKFLOW_ID),
      RUN_RULE_CREATION_STEP_ID
    );
    expect(block).toMatch(/run-as-mode: inherit/);
    expect(block).toMatch(/workflow-id: system-security-rule-creation/);
  });

  it('has the Worker start the sweep, and the sweep start the review, by inherit', () => {
    const workerYaml = readFileSync(
      join(REPO_ROOT, MANAGED_DEFS, 'detection_rule_coverage.yaml'),
      'utf8'
    );
    const workerStep = stepBlock(workerYaml, 'run_rule_coverage');
    expect(workerStep).toMatch(/run-as-mode: inherit/);
    expect(workerStep).toMatch(/workflow-id: system-security-coverage-worker/);

    const sweepStep = stepBlock(
      definitionYaml(ALERTZERO_COVERAGE_WORKER_WORKFLOW_ID),
      'start_review'
    );
    expect(sweepStep).toMatch(/run-as-mode: inherit/);
    expect(sweepStep).toMatch(/workflow-id: system-security-coverage-review/);
  });
});

interface WorkerRecord {
  enabled: boolean;
  settingsRevision: number;
  settings: { autonomy?: string; serviceAccountId?: string };
}

/**
 * A fake Kibana that enforces the product's binding guard on whichever workflow a
 * `serviceAccountId` write lands on. The Workers API binds the Worker's own per-space workflow.
 */
const workersStack = ({
  serviceAccounts = [{ id: 'sa-cov', name: 'alertzero_rule_coverage' }],
  initial = { enabled: false, settingsRevision: 1, settings: {} } as WorkerRecord,
  createServiceAccountFails,
}: {
  serviceAccounts?: Array<{ id: string; name: string }>;
  initial?: WorkerRecord;
  createServiceAccountFails?: number | true;
} = {}) => {
  const worker: WorkerRecord = { ...initial, settings: { ...initial.settings } };
  const boundWorkflowIds: string[] = [];
  const patches: Array<Record<string, unknown>> = [];
  const rolePuts: Array<Record<string, unknown> | undefined> = [];
  const createdAccounts: Array<{ name: string; roles: string[] }> = [];
  const workerWorkflowId = `${COVERAGE_WORKER_ID}-${EVAL_SPACE_ID}`;
  const fetch = jest.fn(async (url: string, opts: { method?: string; body?: string } = {}) => {
    if (url === '/internal/alertzero/workers' && opts.method === 'GET') {
      return {
        workers: [
          {
            id: COVERAGE_WORKER_ID,
            ...worker,
            workflowId: worker.enabled ? workerWorkflowId : null,
          },
        ],
      };
    }
    if (url === `/internal/alertzero/workers/${COVERAGE_WORKER_ID}` && opts.method === 'PATCH') {
      const body = JSON.parse(opts.body ?? '{}');
      patches.push(body);
      if (body.settings?.serviceAccountId) {
        // The Worker's own workflow is what gets the binding.
        assertServiceAccountBindable(EVAL_SPACE_ID);
        boundWorkflowIds.push(workerWorkflowId);
      }
      if (body.enabled !== undefined) worker.enabled = body.enabled;
      worker.settings = { ...worker.settings, ...body.settings };
      worker.settingsRevision += 1;
      return {};
    }
    if (url === '/api/security/role/alertzero_rule_coverage' && opts.method === 'PUT') {
      rolePuts.push((opts as { query?: Record<string, unknown> }).query);
      return {};
    }
    if (url === '/internal/security/service_account' && opts.method === 'POST') {
      const body = JSON.parse(opts.body ?? '{}');
      createdAccounts.push({ name: body.name, roles: body.roles });
      if (createServiceAccountFails) {
        const status = createServiceAccountFails === true ? 400 : createServiceAccountFails;
        throw Object.assign(new Error(`service account create failed (${status})`), { status });
      }
      const id = `sa-minted-${createdAccounts.length}`;
      serviceAccounts = [...serviceAccounts, { id, name: body.name }];
      return { id, name: body.name };
    }
    if (url === '/internal/security/service_account') return { serviceAccounts };
    throw new Error(`unexpected request ${opts.method} ${url}`);
  }) as unknown as HttpHandler;
  return {
    fetch,
    worker,
    boundWorkflowIds,
    patches,
    rolePuts,
    createdAccounts,
    workerWorkflowId,
  };
};

describe('bindCoverageWorker', () => {
  afterEach(() => {
    delete process.env[SERVICE_ACCOUNT_ENV];
  });

  it('enables the Worker with its service account and binds only the space-scoped Worker', async () => {
    const stack = workersStack();
    const binding = await bindCoverageWorker({ fetch: stack.fetch, log });

    expect(binding).toMatchObject({
      workflowId: stack.workerWorkflowId,
      serviceAccountId: 'sa-cov',
    });
    expect(stack.worker).toMatchObject({
      enabled: true,
      settings: { autonomy: 'assisted', serviceAccountId: 'sa-cov' },
    });
    // Nothing global was bound: not the sweep, not the review, not rule_creation.
    expect(stack.boundWorkflowIds).toEqual([stack.workerWorkflowId]);
    for (const globalId of [
      RULE_CREATION_WORKFLOW_ID,
      ALERTZERO_COVERAGE_REVIEW_WORKFLOW_ID,
      ALERTZERO_COVERAGE_WORKER_WORKFLOW_ID,
    ]) {
      expect(stack.boundWorkflowIds).not.toContain(globalId);
    }
  });

  it('never writes to /api/workflows/managed (no run_as on a managed workflow) or mints an account', async () => {
    const stack = workersStack();
    await bindCoverageWorker({ fetch: stack.fetch, log });
    const urls = (stack.fetch as unknown as jest.Mock).mock.calls.map(([url]) => url as string);
    expect(urls.some((url) => url.startsWith('/api/workflows'))).toBe(false);
    const methods = (stack.fetch as unknown as jest.Mock).mock.calls
      .filter(([url]) => url === '/internal/security/service_account')
      .map(([, opts]) => (opts as { method?: string }).method);
    expect(methods.every((method) => method === 'GET')).toBe(true);
  });

  it('prefers the env override, then the Worker’s stored account, then the prebuilt one', async () => {
    const stored = workersStack({
      initial: { enabled: true, settingsRevision: 3, settings: { serviceAccountId: 'sa-stored' } },
    });
    const worker = { id: COVERAGE_WORKER_ID, enabled: true, settingsRevision: 3 };
    expect(
      await resolveCoverageServiceAccountId({
        fetch: stored.fetch,
        worker: { ...worker, settings: { serviceAccountId: 'sa-stored' } },
        env: {},
      })
    ).toBe('sa-stored');
    expect(
      await resolveCoverageServiceAccountId({
        fetch: stored.fetch,
        worker: { ...worker, settings: { serviceAccountId: 'sa-stored' } },
        env: { [SERVICE_ACCOUNT_ENV]: 'sa-env' },
      })
    ).toBe('sa-env');
    expect(
      await resolveCoverageServiceAccountId({
        fetch: workersStack().fetch,
        worker: { ...worker, settings: {} },
        env: {},
      })
    ).toBe('sa-cov');
  });

  it('provisions the account like onboarding when the prebuilt one is absent', async () => {
    const stack = workersStack({ serviceAccounts: [] });
    const binding = await bindCoverageWorker({ fetch: stack.fetch, log });

    // The role PUT runs first, createOnly, with the production role definition.
    expect(stack.rolePuts).toEqual([{ createOnly: true }]);
    // Then the service account create, named and roled the way the product's onboarding does.
    expect(stack.createdAccounts).toEqual([
      { name: 'alertzero_rule_coverage', roles: ['alertzero_rule_coverage'] },
    ]);
    expect(binding.serviceAccountId).toBe('sa-minted-1');
    expect(stack.worker.settings.serviceAccountId).toBe('sa-minted-1');
  });

  it('reuses the prebuilt account without minting a second one', async () => {
    const stack = workersStack(); // ships alertzero_rule_coverage already
    const binding = await bindCoverageWorker({ fetch: stack.fetch, log });

    expect(binding.serviceAccountId).toBe('sa-cov');
    expect(stack.createdAccounts).toEqual([]);
    expect(stack.rolePuts).toEqual([]);
  });

  it('fails loudly when the service account create fails', async () => {
    const stack = workersStack({ serviceAccounts: [], createServiceAccountFails: 400 });
    await expect(bindCoverageWorker({ fetch: stack.fetch, log })).rejects.toThrow(/400/);
    expect(stack.worker.settings.serviceAccountId).toBeUndefined();
  });

  it('restores the Worker to its original enabled flag, autonomy and account', async () => {
    const stack = workersStack({
      initial: {
        enabled: false,
        settingsRevision: 1,
        settings: { autonomy: 'manual', serviceAccountId: 'sa-orig' },
      },
    });
    const binding = await bindCoverageWorker({ fetch: stack.fetch, log });
    // The Worker's stored account wins over the prebuilt one, so the bind re-asserts it.
    expect(stack.worker.settings.serviceAccountId).toBe('sa-orig');
    await binding.restore();
    expect(stack.worker).toMatchObject({
      enabled: false,
      settings: { autonomy: 'manual', serviceAccountId: 'sa-orig' },
    });
  });

  it('restore sends serviceAccountId: null when the Worker had no account (unbind, not keep)', async () => {
    const stack = workersStack({
      initial: { enabled: true, settingsRevision: 1, settings: { autonomy: 'manual' } },
    });
    const binding = await bindCoverageWorker({ fetch: stack.fetch, log });
    expect(stack.worker.settings.serviceAccountId).toBe('sa-cov');

    await binding.restore();
    // An omitted key means "keep" to the Workers API: the Worker would stay bound to the
    // eval's service account after the suite. The restore PATCH must carry an explicit null.
    const restorePatch = stack.patches[stack.patches.length - 1];
    expect(restorePatch.settings).toMatchObject({ serviceAccountId: null });
    expect(stack.worker.settings.serviceAccountId).toBeNull();
  });

  it('restores the Worker when the post-PATCH verification throws, before surfacing the error', async () => {
    // Enabled Worker whose PATCH lands the binding but the follow-up read never sees it —
    // verification fails while the Worker is enabled and bound.
    const stack = workersStack();
    let reads = 0;
    const failing = jest.fn(async (url: string, opts: { method?: string } = {}) => {
      if (url === '/internal/alertzero/workers' && opts.method === 'GET') {
        reads += 1;
        if (reads > 1) {
          return {
            workers: [
              {
                id: COVERAGE_WORKER_ID,
                enabled: false,
                settingsRevision: 2,
                settings: { autonomy: 'assisted', serviceAccountId: 'sa-cov' },
                workflowId: null,
              },
            ],
          };
        }
      }
      return (stack.fetch as (u: string, o?: unknown) => unknown)(url, opts);
    }) as unknown as HttpHandler;

    await expect(bindCoverageWorker({ fetch: failing, log })).rejects.toThrow(
      /not enabled with an installed workflow/
    );
    // The bad bind was rolled back: restore PATCH ran and unbound the account.
    const restorePatch = stack.patches[stack.patches.length - 1];
    expect(restorePatch.settings).toMatchObject({ serviceAccountId: null });
    expect(restorePatch).not.toHaveProperty('enabled');
  });
});

describe('assertRuleCreationInheritedIdentity', () => {
  const ok = {
    type: 'service_account' as const,
    id: 'sa-cov',
    inheritedFrom: { workloadId: 'system-security-detection-rule-coverage-default' },
  };

  it('accepts the bound SA inherited from a workload', () => {
    expect(() =>
      assertRuleCreationInheritedIdentity({ effectiveIdentity: ok, serviceAccountId: 'sa-cov' })
    ).not.toThrow();
  });

  it('fails when the execution recorded no effectiveIdentity', () => {
    expect(() =>
      assertRuleCreationInheritedIdentity({
        effectiveIdentity: undefined,
        serviceAccountId: 'sa-cov',
      })
    ).toThrow(/no effectiveIdentity/);
  });

  it('fails when a different principal executed the run', () => {
    expect(() =>
      assertRuleCreationInheritedIdentity({
        effectiveIdentity: { ...ok, id: 'sa-other' },
        serviceAccountId: 'sa-cov',
      })
    ).toThrow(/not the .*bound service account/s);
  });

  it('fails when the SA was bound directly instead of inherited', () => {
    expect(() =>
      assertRuleCreationInheritedIdentity({
        effectiveIdentity: { type: 'service_account', id: 'sa-cov' },
        serviceAccountId: 'sa-cov',
      })
    ).toThrow(/inheritedFrom/);
  });
});

describe('seedCoverageIndicator', () => {
  const esStub = () => {
    const indexed: Array<Record<string, any>> = [];
    const esClient = {
      indices: { exists: jest.fn(async () => true), create: jest.fn() },
      index: jest.fn(async (params: Record<string, any>) => indexed.push(params)),
    } as unknown as EsClient;
    return { esClient, indexed };
  };

  it('writes a document the coverage sweep selects and coverage_review reads', async () => {
    const { esClient, indexed } = esStub();
    await seedCoverageIndicator({
      esClient,
      id: 'ki-1',
      technique: 'T1078.001',
      gapDescription: 'gap',
      evidence: 'ev',
      spaceId: EVAL_SPACE_ID,
    });

    const [{ index, id, document }] = indexed;
    expect(index).toBe(COVERAGE_BACKING_INDEX);
    expect(id).toBe('ki-1');
    // coverage_worker.yaml search_pending_indicators filters:
    const sweep = readFileSync(join(REPO_ROOT, MANAGED_DEFS, 'coverage_worker.yaml'), 'utf8');
    expect(sweep).toContain('type: security.coverage');
    expect(sweep).toContain('attributes.status: pending');
    expect(sweep).toContain('attributes.space_id:');
    expect(document.type).toBe('security.coverage');
    expect(document.attributes).toMatchObject({ status: 'pending', space_id: EVAL_SPACE_ID });
    expect(Date.parse(document['@timestamp'])).not.toBeNaN();
    // coverage_review.yaml read_ki / gap fields:
    const review = readFileSync(join(REPO_ROOT, MANAGED_DEFS, 'coverage_review.yaml'), 'utf8');
    expect(review).toContain('attributes.technique');
    expect(document).toMatchObject({
      title: 'gap',
      content: 'ev',
      attributes: { technique: 'T1078.001' },
    });
  });
});
