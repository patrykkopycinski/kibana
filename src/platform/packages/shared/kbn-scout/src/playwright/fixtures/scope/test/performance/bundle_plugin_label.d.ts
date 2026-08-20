/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Maps a bundle URL basename (e.g. `discover.entry.js`, `plugin-discover.abc.js`)
 * to a stable logical label for Scout perf aggregation.
 *
 * Legacy webpack per-plugin bundles use `<id>.entry.js` / `<id>.chunk.*.js`.
 * Unified RSPack uses `plugin-<pluginId>.<hash>.js`, shared split chunks
 * (`shared-plugins.<hash>.js`), and `kibana.bundle.js`.
 *
 * [rspack-transition] When the legacy optimizer is removed, simplify branches
 * that only exist for legacy filenames (tracked in LEGACY_REMOVAL_CHECKLIST.md).
 */
export declare function getLogicalBundlePluginLabel(fileName: string): string;
