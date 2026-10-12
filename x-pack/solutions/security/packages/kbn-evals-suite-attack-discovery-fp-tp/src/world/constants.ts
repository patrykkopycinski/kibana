/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Frozen clock every scenario authors its documents against, so they stay
 * byte-stable. Seeding shifts them forward to the current time.
 */
export const FP_TP_BASE_TIME = new Date('2026-07-13T12:00:00.000Z');

/**
 * Default run marker. The manual seed script uses it as-is, so one world at a
 * time lives under these ids; the eval derives a fresh marker per run from it.
 */
export const FP_TP_TWIN_SEED_LABEL = 'ad-fp-tp-twins-2026-09';

export const FP_TP_ENTITY_INDEX = '.entities.v2.latest.default';

/** Alias the workflow reads entities through. */
export const FP_TP_ENTITY_READ_ALIAS = 'entities-latest-default';

export const FP_TP_ATTACK_INDEX = '.alerts-security.attack.discovery.alerts-default';

/**
 * Former ad-hoc index the seeder wrote Attack Discovery documents to before
 * this package switched to the product-managed `FP_TP_ATTACK_INDEX` data
 * stream. Not written to anymore, but a classic-stack world seeded before the
 * switch still has its document here, so cleanup must keep deleting from it
 * during this transition.
 */
export const FP_TP_ATTACK_ADHOC_INDEX = '.adhoc.alerts-security.attack.discovery.alerts-default';

/**
 * Prefix of the plain indices the seeder writes raw endpoint events to.
 *
 * The workflow reads `logs-endpoint.events.*`, but on serverless the
 * `logs-endpoint.events.<category>-default` names are product-managed data
 * streams the seeder does not own: a plain `create` into them is rejected, and
 * a mapping-only write would be an ownership violation. A `fp-tp` segment keeps
 * the seeded events inside the workflow's wildcard while never colliding with a
 * product stream, and the name does not start with a dot.
 */
export const FP_TP_RAW_EVENT_INDEX_PREFIX = 'logs-endpoint.events.fp-tp-';

/**
 * Ingest pipeline every seeded raw event passes through, so `@timestamp` is a
 * parseable date and `event.ingested` reflects ingest time. The workflow's
 * `load_events` step looks back a fixed window from the discovery, so a stale
 * or malformed `@timestamp` would leave the seeded events invisible.
 */
export const FP_TP_RAW_EVENT_INGEST_PIPELINE = 'alertzero-fp-tp-raw-events';

/**
 * Composable index template the seeder owns for its raw-event streams. A name in
 * `logs-endpoint.events.*` matches the generic `logs` template (`logs-*-*`,
 * data_stream), so a plain index is refused; the seeder defines its own
 * data-stream template above it (see `raw_events.ts`).
 */
export const FP_TP_RAW_EVENT_INDEX_TEMPLATE = 'alertzero-fp-tp-raw-events';

/** Half-width of the raw-event window the analysis reads around the attack timestamp. */
export const FP_TP_RAW_EVENT_WINDOW_MS = 2 * 60 * 60 * 1000;
