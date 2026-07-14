/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parse, stringify } from 'yaml';

import SETUP_FRAGMENT_YAML from './_fragments/setup_step.yaml';

type WorkflowStep = { name?: string };
type WorkflowYamlDoc = {
  steps?: WorkflowStep[];
  [key: string]: unknown;
};

const SETUP_STEP = (parse(SETUP_FRAGMENT_YAML) as WorkflowStep[])[0];

/**
 * Prepend the canonical Daybreak setup step and drop duplicate `setup` steps.
 * The engine has no YAML include/anchor support — this TS prefix is the contract.
 */
export const composeWorkerYaml = (bodyYaml: string): string => {
  const doc = parse(bodyYaml) as WorkflowYamlDoc;
  const steps = (doc.steps ?? []).filter((step) => step.name !== 'setup');
  return stringify({ ...doc, steps: [SETUP_STEP, ...steps] });
};
