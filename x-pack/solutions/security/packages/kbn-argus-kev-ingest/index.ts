/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export {
  inferKevPlatforms,
  inferKevSeverity,
  mapKevEntry,
  mapKevFeed,
  type CisaKevEntry,
  type CisaKevFeed,
  type KevAdvisoryDoc,
} from './kev_advisory';
export { fetchCisaKevFeed, DEFAULT_CISA_KEV_URL } from './fetch_feed';
export { ingestKev } from './ingest';
