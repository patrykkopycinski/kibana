/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** Spike-owned proposal document schema version. Bump on breaking field changes. */
export const DAYBREAK_PROPOSAL_SCHEMA_VERSION = '1.0.0-spike';

/** Spike-owned evidence package schema version. */
export const DAYBREAK_EVIDENCE_SCHEMA_VERSION = '1.0.0-spike';

/** Spike-owned WorkerRef schema version. */
export const DAYBREAK_WORKER_REF_SCHEMA_VERSION = '1.0.0-spike';

/** Spike-owned Investigation schema version. */
export const DAYBREAK_INVESTIGATION_SCHEMA_VERSION = '1.0.0-spike';

/** Spike-owned Significant Security Event schema version. */
export const DAYBREAK_SSE_SCHEMA_VERSION = '1.0.0-spike';

/** Spike-owned Action Result schema version. */
export const DAYBREAK_ACTION_RESULT_SCHEMA_VERSION = '1.0.0-spike';

/**
 * Ownership model for spike schemas. The spike defines the working contract;
 * cross-team alignment (#17942) can adopt or diff against these exports later.
 */
export const SCHEMA_OWNERSHIP = 'spike-canonical' as const;

/** Default alert-analysis worker id (CWL WorkerRef alignment). */
export const DEFAULT_ALERT_ANALYSIS_WORKER_ID = 'daybreak-alert-analysis-worker';
