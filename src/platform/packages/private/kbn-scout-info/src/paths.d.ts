/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export declare const SCOUT_OUTPUT_ROOT: string;
export declare const SCOUT_SERVERS_ROOT: string;
export declare const SCOUT_REPORT_OUTPUT_ROOT: string;
export declare const SCOUT_TEST_CONFIG_STATS_PATH: string;
export declare const SCOUT_PLAYWRIGHT_CONFIGS_PATH: string;
export declare const PLATFORM_AND_SOLUTION_SCOUT_ROOT_PATH_GLOB =
  '{src/platform,src/core,x-pack/**}/{plugins,packages}/**/test/scout{_*,}';
export declare const EXAMPLE_PLUGIN_SCOUT_ROOT_PATH_GLOB =
  '{examples,x-pack/examples}/**/test/scout{_*,}';
export declare const CORE_MODULE_SCOUT_ROOT_PATH_GLOB = 'src/core/test/scout{_*,}';
export declare const TESTABLE_COMPONENT_SCOUT_ROOT_PATH_GLOB: string;
export declare const TESTABLE_COMPONENT_SCOUT_ROOT_PATH_REGEX: RegExp;
export declare const SCOUT_TEST_CATEGORIES: string[];
export declare const SCOUT_CONFIG_PATH_GLOB: string;
export declare const SCOUT_CONFIG_PATH_REGEX: RegExp;
export declare const SCOUT_CONFIG_MANIFEST_PATH_GLOB: string;
/**
 * Playwright configs under top-level `examples/` and `x-pack/examples/` (developer example plugins).
 * `module.name` for these paths is resolved from `plugin.id` in kibana.jsonc (see test_config.fromPath).
 * Capture groups: 1=examplesRoot, 2=plugin, 3=serverConfigSet, 4=namespace (optional), 5=category, 6=configType.
 */
export declare const SCOUT_EXAMPLES_PLAYWRIGHT_CONFIG_REGEX: RegExp;
/**
 * Unified regex matching both platform/solution and example plugin Playwright config paths.
 * Uses named capture groups so callers can branch on `examplesRoot` to decide how to
 * resolve module metadata (kibana.jsonc vs directory-derived).
 */
export declare const SCOUT_UNIFIED_CONFIG_PATH_REGEX: RegExp;
export declare const SCOUT_CI_CONFIG_PATH: string;
/**
 * Documentation-only files inside Scout test scopes that should be ignored when
 * deciding whether a PR's diff is "Scout tests only". A README or markdown change
 * next to a Playwright config is noise — it must not block the fast path nor
 * schedule any Playwright config to run.
 */
export declare const SCOUT_TESTS_ONLY_IGNORE_PATTERNS: readonly string[];
/**
 * Path globs that uniquely identify a Scout test scope — i.e. a directory
 * containing a Playwright config and its co-located tests/fixtures/helpers.
 *
 * A "scope" is `<package-root>/test/(scout|scout_<custom>)[/<namespace>]/(api|ui)`, owning at
 * most two configs:
 *   - <scope>/playwright.config.ts          (single-thread, tests under tests/)
 *   - <scope>/parallel.playwright.config.ts (parallel, tests under parallel_tests/)
 *
 * The optional `<namespace>` segment is a single-level sub-directory directly under
 * the scout root (e.g. `test/scout/detection_engine/ui/`). It enables a single
 * plugin to have multiple independent Playwright configs — one per logical team
 * namespace — while still sharing the same server configuration.
 *
 * The `.meta/(api|ui)` variant covers auto-generated manifests. For namespace configs
 * the manifest lives at `test/scout/<namespace>/.meta/(api|ui)/`.
 *
 * Both patterns derive their `(api|ui)` and `scout(_*,)` segments from
 * `SCOUT_TEST_CATEGORIES` and the same brace-expansion idiom used by
 * `SCOUT_CONFIG_MANIFEST_PATH_GLOB` so they all stay in sync.
 */
export declare const SCOUT_TESTS_ONLY_SCOPE_GLOBS: readonly string[];
/**
 * Scout `fixtures/` directories, excluded from the "tests-only" fast path: their
 * entry points (e.g. page objects) can be imported by other plugins, so a change
 * must run downstream configs (dependency-tree mode) rather than tests-only.
 *
 * The globstar is kept only at the end; a globstar-before-`fixtures` form is
 * avoided because minimatch fails to match a single trailing segment when a
 * leading globstar collapses to zero.
 */
export declare const SCOUT_TESTS_ONLY_EXCLUDE_GLOBS: readonly string[];
/**
 * Captures `<prefix>/test/scout{_*}[/<namespace>]/(api|ui)/<rest?>` and its `.meta/` variant.
 * A negative lookahead prevents `.meta` from being captured as a namespace; backtracking
 * prevents `api`/`ui` from being captured as a namespace.
 *
 * Capture groups: 1=prefix, 2=scoutDir, 3=namespace (optional), 4=category (api|ui), 5=rest (optional).
 */
export declare const SCOUT_TEST_SCOPE_PATTERN: RegExp;
/**
 * Files whose modification invalidates Scout selective testing entirely:
 * any change here forces a full Scout suite run regardless of the diff's
 * other contents.
 */
export declare const CRITICAL_FILES_SCOUT: readonly string[];
