/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under the
 * Elastic License 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getInferenceEndpointId, inferenceEndpointExists, type EvalConnector } from '@kbn/evals';
import type { Client as EsClient } from '@elastic/elasticsearch';
import type { HttpHandler } from '@kbn/core/public';
import type { ToolingLog } from '@kbn/tooling-log';
import {
  ALERTZERO_API_VERSION,
  ALERTZERO_WORKERS_URL,
  COVERAGE_BACKING_INDEX,
  COVERAGE_WORKER_AUTONOMY,
  COVERAGE_WORKER_ID,
  COVERAGE_WORKER_SERVICE_ACCOUNT_NAME,
  RULE_CREATION_WORKFLOW_ID,
  WORKFLOWS_API_VERSION,
  DRAFT_STEP_ID,
  PROPOSE_STEP_ID,
  INFERENCE_SETTINGS_API_VERSION,
  INFERENCE_SETTINGS_ROUTE,
  RULE_CREATION_INFERENCE_FEATURE_ID,
  SERVICE_ACCOUNT_ENV,
  SERVICE_ACCOUNTS_API_VERSION,
} from './constants';

// The model connector (used by the workflow's ai.agent step) is not checked here — if it is
// misconfigured the workflow execution will fail loudly on its own. Only the judge connector
// can fail silently: a missing judge causes LLM evaluators to return N/A with no obvious error.
export const ensureJudgeConnectorAccessible = async ({
  fetch,
  connector,
  log,
}: {
  fetch: HttpHandler;
  connector: EvalConnector;
  log: ToolingLog;
}): Promise<void> => {
  const inferenceId = getInferenceEndpointId(connector);
  if (!inferenceId) {
    throw new Error(
      `AI connector "${connector.name}" (${connector.id}) is not an inference endpoint. This suite only supports inference endpoints`
    );
  }

  log.info(
    `Verifying inference endpoint ${inferenceId} for AI connector: ${connector.name} (${connector.id})`
  );
  try {
    const exists = await inferenceEndpointExists({ fetch, inferenceId });
    if (!exists) {
      throw new Error(`inference endpoint ${inferenceId} does not exist`);
    }
    log.info('AI connector is accessible — proceeding with eval run');
  } catch (err) {
    throw new Error(
      `Inference endpoint [${inferenceId}] for AI connector "${connector.name}" (${connector.id}) is not accessible. ` +
        `Original error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
};

/**
 * The step names the client and evaluators address. The managed workflow's yaml is the source of
 * truth — this pins the contract the suite depends on so renaming a step in the yaml fails setup
 * here instead of surfacing as opaque timeouts in every downstream lookup.
 */
export const REQUIRED_STEP_IDS = [DRAFT_STEP_ID, PROPOSE_STEP_ID] as const;

/**
 * Parses the installed workflow's step names out of its yaml without a yaml dependency:
 * every `  - name: <id>` under the `steps:` key is a step declaration. Any non-indented
 * line moves the cursor to that top-level key, so `- name:` items under `outputs:` or
 * `triggers:` are never collected.
 */
export const parseStepNames = (yaml: string): string[] => {
  const names: string[] = [];
  let inSteps = false;
  for (const line of yaml.split('\n')) {
    if (/^\S/.test(line)) {
      inSteps = /^steps:/.test(line);
    } else {
      const match = /^ {2}- name: (.+)$/.exec(line);
      if (inSteps && match) {
        names.push(match[1].trim());
      }
    }
  }
  return names;
};

/**
 * Asserts the managed rule-creation workflow the alertzero plugin installs at start is present, and
 * returns its yaml.
 *
 * This deliberately does NOT create the workflow. The eval must measure the artifact production
 * ships — if the suite carried its own copy of the yaml, or created one on the fly, it would score
 * green against a document that no user ever runs while the real workflow regressed unobserved.
 * A missing workflow is an environment failure and should fail loudly here rather than surface as
 * mystery zeroes across every evaluator.
 */
export const assertWorkflowInstalled = async ({
  fetch,
  log,
}: {
  fetch: HttpHandler;
  log: ToolingLog;
}): Promise<{ yaml: string }> => {
  log.info(`Checking managed workflow: ${RULE_CREATION_WORKFLOW_ID}`);
  let workflow: { yaml: string };
  try {
    workflow = await fetch<{ yaml: string }>(
      `/api/workflows/workflow/${RULE_CREATION_WORKFLOW_ID}`,
      {
        method: 'GET',
        version: WORKFLOWS_API_VERSION,
        headers: { 'elastic-api-version': WORKFLOWS_API_VERSION },
      }
    );
    log.info('Managed workflow is installed — proceeding with eval run');
  } catch (err) {
    throw new Error(
      `Managed workflow "${RULE_CREATION_WORKFLOW_ID}" is not installed. It is installed at ` +
        `plugin start by the alertzero plugin (installStatic / ALERTZERO_WATCH_WORKFLOW_IDS), so this ` +
        `usually means the alertzero plugin is disabled or the Workflows feature is unavailable. ` +
        `This suite does not create the workflow itself: it must measure the workflow that ships. ` +
        `Original error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // The installed document must still expose the step ids the client and evaluators
  // address by name. A rename in the managed yaml previously surfaced downstream as an
  // opaque "step not found in waiting state" poll timeout, not a setup failure.
  const stepNames = parseStepNames(workflow.yaml);
  const missing = REQUIRED_STEP_IDS.filter((id) => !stepNames.includes(id));
  if (missing.length > 0) {
    throw new Error(
      `Managed workflow "${RULE_CREATION_WORKFLOW_ID}" no longer declares step(s) ` +
        `${missing.join(', ')} (found: ${stepNames.join(', ')}). The eval client and evaluators ` +
        `address steps by id — update DRAFT_STEP_ID / PROPOSE_STEP_ID in src/constants.ts when ` +
        `the managed yaml renames them.`
    );
  }

  return workflow;
};

interface InferenceFeatureSetting {
  feature_id: string;
  endpoints: Array<{ id: string }>;
}

/** Replaces one feature's endpoint pick and keeps every other feature's pick as it was. */
export const mergeFeatureOverride = (
  features: readonly InferenceFeatureSetting[],
  featureId: string,
  endpointId: string
): InferenceFeatureSetting[] => [
  ...features.filter(({ feature_id: id }) => id !== featureId),
  { feature_id: featureId, endpoints: [{ id: endpointId }] },
];

/**
 * Points the workflow's `ai.agent` step at the model under test.
 *
 * The step resolves its connector with `connector-id-by-feature: alertzero_reasoning`, not from
 * the eval connector. Without this, every cell of a multi-model run drafts on the stack's default
 * model and its scores are attributed to the wrong model. Returns a restore callback. The PUT
 * replaces the whole settings object, so this reads, merges and writes.
 */
export const bindModelUnderTest = async ({
  fetch,
  connector,
  log,
}: {
  fetch: HttpHandler;
  connector: EvalConnector;
  log: ToolingLog;
}): Promise<() => Promise<void>> => {
  const headers = { 'elastic-api-version': INFERENCE_SETTINGS_API_VERSION };
  const write = (features: readonly InferenceFeatureSetting[]) =>
    fetch(INFERENCE_SETTINGS_ROUTE, {
      method: 'PUT',
      version: INFERENCE_SETTINGS_API_VERSION,
      headers,
      body: JSON.stringify({ features }),
    });

  const { data } = await fetch<{ data: { features: InferenceFeatureSetting[] } }>(
    INFERENCE_SETTINGS_ROUTE,
    { method: 'GET', version: INFERENCE_SETTINGS_API_VERSION, headers }
  );
  const previous = data.features;
  log.info(
    `Binding ${RULE_CREATION_INFERENCE_FEATURE_ID} to the model under test: ${connector.id}`
  );
  await write(mergeFeatureOverride(previous, RULE_CREATION_INFERENCE_FEATURE_ID, connector.id));
  return async () => {
    await write(previous);
  };
};

/**
 * Fails the run when the draft step did not run on the model under test. The step reports its
 * connector in `output.metadata.usage.connectorId`. A mismatch means the feature binding did not
 * take, and every score in the run belongs to a different model.
 */
export const assertDraftRanOnModel = ({
  connectorId,
  expected,
}: {
  connectorId: string | undefined;
  expected: string;
}): void => {
  if (connectorId !== expected) {
    throw new Error(
      `draft_creation ran on connector "${connectorId ?? 'unknown'}", not the model under test ` +
        `"${expected}". The ${RULE_CREATION_INFERENCE_FEATURE_ID} feature binding did not take, so ` +
        `scores would be attributed to the wrong model.`
    );
  }
};


/**
 * Mirror of the binding guard in workflows_management
 * (`withWorkflowBindingChange`, workflow_service_account_binding.ts): a service account can only
 * be bound to a workflow installed in a specific space. Managed workflows that production
 * installs once for every space live in the global space `*` and are rejected with a 400.
 * Kept here so the unit tests can prove a fixture design against the guard (and a drift test pins
 * this copy to the product source).
 */
export const GLOBAL_WORKFLOW_SPACE_ID = '*';
export const BINDING_GUARD_MESSAGE =
  'Service account bindings require a workflow installed in a specific space.';

export const assertServiceAccountBindable = (workflowSpaceId: string): void => {
  if (workflowSpaceId === GLOBAL_WORKFLOW_SPACE_ID) {
    throw new Error(BINDING_GUARD_MESSAGE);
  }
};

interface ServiceAccountDto {
  id: string;
  name: string;
}

export interface WorkerState {
  id: string;
  enabled: boolean;
  settingsRevision: number | null;
  settings: { autonomy?: string; serviceAccountId?: string };
  /** Installed per-space workflow id (`<workerId>-<space>`); null until installed. */
  workflowId?: string | null;
}

const workersHeaders = { 'elastic-api-version': ALERTZERO_API_VERSION, 'kbn-xsrf': 'true' };

const listWorkers = async (fetch: HttpHandler): Promise<WorkerState[]> => {
  const { workers } = await fetch<{ workers: WorkerState[] }>(ALERTZERO_WORKERS_URL, {
    method: 'GET',
    version: ALERTZERO_API_VERSION,
    headers: workersHeaders,
  });
  return workers ?? [];
};

const patchWorker = (
  fetch: HttpHandler,
  body: { enabled?: boolean; settingsRevision: number | null; settings: Record<string, unknown> }
) =>
  fetch(`${ALERTZERO_WORKERS_URL}/${encodeURIComponent(COVERAGE_WORKER_ID)}`, {
    method: 'PATCH',
    version: ALERTZERO_API_VERSION,
    headers: workersHeaders,
    body: JSON.stringify(body),
  });

/**
 * The service account the coverage Worker runs as: `ALERTZERO_EVAL_SERVICE_ACCOUNT_ID` when set
 * (the #293963 worker-chain override), else the Worker's already-stored account, else the
 * prebuilt `alertzero_rule_coverage` account production provisions. Never minted here.
 */
export const resolveCoverageServiceAccountId = async ({
  fetch,
  worker,
  env = process.env,
}: {
  fetch: HttpHandler;
  worker: WorkerState;
  env?: NodeJS.ProcessEnv;
}): Promise<string> => {
  const fromEnv = env[SERVICE_ACCOUNT_ENV];
  if (fromEnv) return fromEnv;
  if (worker.settings.serviceAccountId) return worker.settings.serviceAccountId;
  const { serviceAccounts } = await fetch<{ serviceAccounts: ServiceAccountDto[] }>(
    '/internal/security/service_account',
    {
      method: 'GET',
      version: SERVICE_ACCOUNTS_API_VERSION,
      headers: { 'elastic-api-version': SERVICE_ACCOUNTS_API_VERSION },
    }
  );
  const account = serviceAccounts.find(({ name }) => name === COVERAGE_WORKER_SERVICE_ACCOUNT_NAME);
  if (!account) {
    throw new Error(
      `No service account for the coverage Worker: set ${SERVICE_ACCOUNT_ENV}, or enable the ` +
        `Rule Coverage Worker once in the UI so "${COVERAGE_WORKER_SERVICE_ACCOUNT_NAME}" exists.`
    );
  }
  return account.id;
};

export interface CoverageWorkerBinding {
  /** Per-space Worker workflow id to POST /run. */
  workflowId: string;
  serviceAccountId: string;
  /** Puts the Worker's enabled flag, autonomy and service account back (best effort). */
  restore: () => Promise<void>;
}

/**
 * Enables the coverage Worker in the eval space with its service account, the way the Workers
 * page does (PATCH /internal/alertzero/workers/{id}, #293963 pattern), as the suite's admin user.
 * The Worker workflow is installed per space (`<workerId>-<space>`), so the account binds to a
 * space-scoped workflow; the global sweep, review and rule_creation workflows below it inherit
 * that identity via `run-as-mode: inherit` and are never bound.
 */
export const bindCoverageWorker = async ({
  fetch,
  log,
}: {
  fetch: HttpHandler;
  log: ToolingLog;
}): Promise<CoverageWorkerBinding> => {
  const original = (await listWorkers(fetch)).find(({ id }) => id === COVERAGE_WORKER_ID);
  if (!original) {
    throw new Error(`Worker "${COVERAGE_WORKER_ID}" is not registered; is the alertzero plugin on?`);
  }
  const serviceAccountId = await resolveCoverageServiceAccountId({ fetch, worker: original });

  await patchWorker(fetch, {
    ...(original.enabled ? {} : { enabled: true }),
    settingsRevision: original.settingsRevision,
    settings: { autonomy: COVERAGE_WORKER_AUTONOMY, serviceAccountId },
  });

  const bound = (await listWorkers(fetch)).find(({ id }) => id === COVERAGE_WORKER_ID);
  if (!bound?.enabled || !bound.workflowId) {
    throw new Error(
      `Coverage Worker is not enabled with an installed workflow after the PATCH ` +
        `(enabled: ${bound?.enabled}, workflowId: ${bound?.workflowId}).`
    );
  }
  if (bound.settings.serviceAccountId !== serviceAccountId) {
    throw new Error(
      `Coverage Worker did not store service account ${serviceAccountId} ` +
        `(has ${bound.settings.serviceAccountId}).`
    );
  }
  log.info(`Coverage Worker enabled as ${serviceAccountId} (workflow ${bound.workflowId})`);

  return {
    workflowId: bound.workflowId,
    serviceAccountId,
    restore: async () => {
      const current = (await listWorkers(fetch)).find(({ id }) => id === COVERAGE_WORKER_ID);
      await patchWorker(fetch, {
        ...(current && current.enabled !== original.enabled ? { enabled: original.enabled } : {}),
        settingsRevision: current?.settingsRevision ?? null,
        settings: {
          autonomy: original.settings.autonomy,
          ...(original.settings.serviceAccountId !== undefined
            ? { serviceAccountId: original.settings.serviceAccountId }
            : {}),
        },
      });
    },
  };
};

/** Marks documents this suite wrote, so cleanup deletes only them. */
export const EVAL_INDICATOR_PRODUCER = 'rule_creation_eval';

/**
 * Creates the indicator index with the keyword mappings the sweep's term filters need, when the
 * stack has not created it yet. An existing index (Context Engine's own) is left untouched.
 */
export const ensureCoverageIndex = async (esClient: EsClient): Promise<void> => {
  const exists = await esClient.indices.exists({ index: COVERAGE_BACKING_INDEX });
  if (exists) return;
  await esClient.indices.create({
    index: COVERAGE_BACKING_INDEX,
    mappings: {
      properties: {
        '@timestamp': { type: 'date' },
        type: { type: 'keyword' },
        title: { type: 'text' },
        content: { type: 'text' },
        attributes: {
          properties: {
            status: { type: 'keyword' },
            technique: { type: 'keyword' },
            space_id: { type: 'keyword' },
            producer: { type: 'keyword' },
          },
        },
      },
    },
  });
};

/**
 * Writes one pending `security.coverage` indicator, the document shape the sweep selects
 * (coverage_worker.yaml: type, attributes.status=pending, attributes.space_id, @timestamp window)
 * and coverage_review reads (title, content, attributes.technique), modeled on the product's
 * write_coverage_kis.ts. Returns the indicator id.
 */
export const seedCoverageIndicator = async ({
  esClient,
  id,
  technique,
  gapDescription,
  evidence,
  spaceId,
}: {
  esClient: EsClient;
  id: string;
  technique: string;
  gapDescription: string;
  evidence: string;
  spaceId: string;
}): Promise<string> => {
  await ensureCoverageIndex(esClient);
  const now = new Date().toISOString();
  await esClient.index({
    index: COVERAGE_BACKING_INDEX,
    id,
    refresh: 'wait_for',
    document: {
      '@timestamp': now,
      id,
      updated_at: now,
      type: 'security.coverage',
      title: gapDescription,
      description: gapDescription,
      content: evidence,
      tags: ['consumer:detection', 'status:pending'],
      attributes: {
        status: 'pending',
        technique,
        space_id: spaceId,
        producer: EVAL_INDICATOR_PRODUCER,
      },
    },
  });
  return id;
};

export const deleteEvalIndicators = async (esClient: EsClient): Promise<void> => {
  const exists = await esClient.indices.exists({ index: COVERAGE_BACKING_INDEX });
  if (!exists) return;
  await esClient.deleteByQuery({
    index: COVERAGE_BACKING_INDEX,
    refresh: true,
    query: { term: { 'attributes.producer': EVAL_INDICATOR_PRODUCER } },
  });
};
