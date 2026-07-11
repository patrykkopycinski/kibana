/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Write alias for the Daybreak proposal store (mirrors
 * `server/client/proposals/storage.ts`'s `proposalIndexName`, which
 * `@kbn/storage-adapter`'s `StorageIndexAdapter` uses as both the index
 * template name and the write alias — see `getAliasName`/`getWriteTarget` in
 * `@kbn/storage-adapter`'s index adapter). Seeded directly via `esClient` in
 * the journey spec since the Proposal HTTP API has no `POST /proposals`
 * create route (see `server/http_routes/proposals.ts` — only list,
 * get-by-id, and transition are registered).
 */
export const DAYBREAK_PROPOSALS_ALIAS = '.kibana-daybreak-proposals';

/** Default Kibana space used by the journey (unscoped, matches Scout's default admin space). */
export const DEFAULT_SPACE = 'default';
