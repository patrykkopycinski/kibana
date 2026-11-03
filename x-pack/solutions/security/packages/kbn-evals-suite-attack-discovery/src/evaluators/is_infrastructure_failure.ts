/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttackDiscoveryTaskOutput } from '../types';

/**
 * True only when the task explicitly marked the run as an infrastructure failure and produced
 * no insights. A missing marker never counts: unmarked failures are model failures.
 */
export const isInfrastructureFailure = (output: AttackDiscoveryTaskOutput | undefined): boolean =>
  output?.errorKind === 'infrastructure' && (!output.insights || !Array.isArray(output.insights));
