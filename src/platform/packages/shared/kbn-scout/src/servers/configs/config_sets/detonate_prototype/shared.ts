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

/**
 * EIS QA gateway. Setting `xpack.inference.elastic.url` at boot is what lets
 * the Agent Builder surfaces (whose gate is "at least one inference
 * connector") work in this stack — the setting is static and cannot be added
 * to a running node. The CCM API key still needs a one-time
 * `node scripts/eis.js` push after ES is up.
 */
const EIS_QA_URL = 'https://inference.eu-west-1.aws.svc.qa.elastic.cloud';

/**
 * AlertZero-family boot flags, gated behind DETONATE_ALERTZERO so the default
 * boot of this config set is unchanged. Plugin enablement (alertzero,
 * proposals, agenticInvestigations) and the service accounts the Watch
 * Orchestrator runs as are static settings — none can be flipped at runtime.
 * The per-space gate (`securitySolution:enableAlertZero`) stays a runtime
 * advanced setting set after boot.
 */
const alertzeroServerArgs = [
  '--xpack.alertzero.enabled=true',
  '--xpack.proposals.enabled=true',
  '--xpack.agenticInvestigations.enabled=true',
  '--xpack.security.serviceAccounts.enabled=true',
];

export const detonatePrototypeServerArgs = [
  `--xpack.securitySolution.enableExperimental=${JSON.stringify(['detonatePrototypeEnabled'])}`,
  `--xpack.securitySolution.detonatePrototype.serviceUrl=${
    process.env.DETONATE_SERVICE_URL ?? DEFAULT_LOCAL_SERVICE_URL
  }`,
  ...(process.env.DETONATE_ALERTZERO ? alertzeroServerArgs : []),
];

/**
 * ES-side args for the detonate prototype config set. Empty unless
 * `DETONATE_EIS` is set, so the default boot is unchanged; set it when the
 * demo/recording needs the Agent Builder skills page or chat-backed skills.
 */
export const detonatePrototypeEsServerArgs = [
  ...(process.env.DETONATE_EIS ? [`xpack.inference.elastic.url=${EIS_QA_URL}`] : []),
];
