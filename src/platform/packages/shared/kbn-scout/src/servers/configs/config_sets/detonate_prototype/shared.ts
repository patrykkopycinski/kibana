/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * The detonate prototype needs two things at boot and neither can be toggled at
 * runtime: the experimental flag that registers its routes, app link and
 * Agent Builder tools, and the address of the detonation service the server
 * client talks to. A runtime UI setting cannot register server routes, which is
 * why this suite needs its own config set rather than `default`.
 *
 * The service address comes from the environment. No deployment address belongs
 * in this repository, and the fallback is a localhost port that is useless to
 * anyone but the developer running the local simulator.
 */
const DEFAULT_LOCAL_SERVICE_URL = 'http://localhost:8787';

export const detonatePrototypeServerArgs = [
  `--xpack.securitySolution.enableExperimental=${JSON.stringify(['detonatePrototypeEnabled'])}`,
  `--xpack.securitySolution.detonatePrototype.serviceUrl=${
    process.env.DETONATE_SERVICE_URL ?? DEFAULT_LOCAL_SERVICE_URL
  }`,
];
