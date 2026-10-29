/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  WORKER_SERVICE_ACCOUNT_NAMES,
  buildSecurityRoleUrl,
  getWorkerRoleName,
} from '../../common/constants';
import { ok } from '../../../scout_alertzero_e2e/common/kbn';
import type { AlertZeroApi } from '../../../scout_alertzero_e2e/common/kbn';

const SERVICE_ACCOUNT_URL = '/internal/security/service_account';
const WORKFLOW_URL = (workflowId: string) => `/api/workflows/workflow/${encodeURIComponent(workflowId)}`;

interface ServiceAccountEntry {
  id: string;
  name: string;
  enabled: boolean;
  assumable: boolean;
}

export interface WorkerAccount {
  readonly id: string;
  /** True when this run created the account, so only this run may delete it. */
  readonly created: boolean;
}

const listAccounts = async (api: AlertZeroApi): Promise<ServiceAccountEntry[]> => {
  const accounts: ServiceAccountEntry[] = [];
  let after: string | undefined;
  do {
    const page = ok(
      await api.internal<{ serviceAccounts: ServiceAccountEntry[]; nextPage?: string }>(
        'GET',
        SERVICE_ACCOUNT_URL,
        { query: { limit: 100, ...(after ? { after } : {}) } }
      ),
      'list service accounts'
    );
    accounts.push(...page.serviceAccounts);
    after = page.nextPage;
  } while (after);
  return accounts;
};

/**
 * The Worker's role is an Elasticsearch reserved role since #296898 and AlertZero no longer creates
 * it, so the eval only checks that it exists and is built in. A stack without it fails here, by
 * name, instead of silently binding a different identity.
 */
export const findBuiltInWorkerRole = async (
  api: AlertZeroApi,
  accountName: string
): Promise<string> => {
  const roleName = getWorkerRoleName(accountName, { isServerless: false });
  const missing = () =>
    new Error(
      `Elasticsearch has no built-in "${roleName}" role for the ${accountName} worker. ` +
        'The ES snapshot must be at least as new as the Kibana under test.'
    );
  const result = await api.public<{ metadata?: { _reserved?: unknown } }>(
    'GET',
    buildSecurityRoleUrl(roleName)
  );
  if (result.statusCode === 404) {
    throw missing();
  }
  const role = ok(result, `read the ${roleName} role`);
  if (role.metadata?._reserved !== true) {
    throw missing();
  }
  return roleName;
};

/** Finds or creates the named, built-in-role service account a Worker runs as. */
export const ensureWorkerAccount = async (
  api: AlertZeroApi,
  workerId: string
): Promise<WorkerAccount> => {
  const name = WORKER_SERVICE_ACCOUNT_NAMES[workerId];
  if (!name) {
    throw new Error(`No service account name is defined for worker ${workerId}`);
  }
  const accounts = await listAccounts(api);
  const existing = accounts.find((account) => account.name === name && account.enabled && account.assumable);
  if (existing) {
    return { id: existing.id, created: false };
  }
  if (accounts.some((account) => account.name === name)) {
    throw new Error(`Service account ${name} exists but is disabled or not assumable`);
  }
  const roleName = await findBuiltInWorkerRole(api, name);
  const created = ok(
    await api.internal<{ id?: string }>('POST', SERVICE_ACCOUNT_URL, {
      body: { name, roles: [roleName], description: 'AlertZero eval worker' },
    }),
    `create service account ${name}`
  );
  if (!created.id) {
    throw new Error(`Service account ${name} was created without an id`);
  }
  return { id: created.id, created: true };
};

/**
 * Proves the bind took where it matters: the installed workflow carries `settings.run_as` of the
 * account. A Worker whose run_as is missing resumes its children with "No service account is bound
 * to workload", and the sweep then reports zero reviews instead of failing.
 */
export const assertWorkflowRunsAs = async (
  api: AlertZeroApi,
  { workflowId, serviceAccountId }: { workflowId: string; serviceAccountId: string }
): Promise<void> => {
  const workflow = ok(
    await api.public<{ definition?: { settings?: { run_as?: string } } }>(
      'GET',
      WORKFLOW_URL(workflowId)
    ),
    `read workflow ${workflowId}`
  );
  const runAs = workflow.definition?.settings?.run_as;
  if (runAs !== serviceAccountId) {
    throw new Error(
      `Workflow ${workflowId} has settings.run_as=${String(runAs)}, expected ${serviceAccountId} after binding`
    );
  }
};
