import type { ToolingLog } from '@kbn/tooling-log';
import type { CodeChanges } from './code_changes';
/**
 * Returns true when at least one changed file matches the Scout critical-files list.
 * A critical-files hit forces a full Scout suite run (selective testing skipped).
 */
export declare const criticalScoutFilesTouched: (changedFiles: readonly string[]) => boolean;
/**
 * Returns true when, after dropping noise files (READMEs, markdown, changelogs),
 * every remaining changed file lives inside a Scout test scope. Empty diffs
 * (or noise-only diffs) return false — there is nothing to fast-path.
 *
 * Changes under a Scout `fixtures/` directory are excluded: page objects there
 * can be imported by other plugins, so they fall through to dependency-tree mode.
 */
export declare const isScoutTestsOnlyDiff: (changedFiles: readonly string[]) => boolean;
/**
 * Map a single changed file path to the Playwright config(s) that own it.
 *
 * Returns 0–2 repo-relative config paths:
 *   - 0 when the file is outside any Scout scope
 *   - 1 when the file is under `tests/` or `parallel_tests/` (single owning config)
 *   - 1–2 for shared scope files (fixtures, helpers, page objects, .meta/, the
 *     config file itself) filtered against `repoRoot` to drop configs that
 *     don't exist on disk.
 *
 * The resolver never crosses ui ↔ api or scout ↔ scout_<custom> scopes.
 */
export declare const deriveScoutConfigsForFile: (file: string, repoRoot: string, existsCache?: Map<string, boolean>) => string[];
/**
 * Map a list of changed files to the union of owning Playwright configs.
 * Used as the affected-configs filter in `discover-playwright-configs` and
 * `create-test-tracks`.
 */
export declare const deriveScoutConfigsForFiles: (files: readonly string[], repoRoot: string) => Set<string>;
/**
 * Outcome of the Scout selective-testing decision. Consumers
 * (`discover-playwright-configs`, `create-test-tracks`) dispatch on `kind` to
 * apply the matching filter to their own test items.
 *
 *   - 'full'             : run everything (selective testing disabled, or the
 *                          diff touches a critical Scout file).
 *   - 'tests-only'       : run only the Playwright configs whose owning scope
 *                          contains a changed file. `affectedConfigPaths` is
 *                          repo-relative.
 *   - 'dependency-tree'  : run configs whose owning @kbn/ module appears in
 *                          `affectedModuleIds` (graph-traversal mode).
 */
export type ScoutTestingScope = {
    kind: 'full';
    reason: 'selective-disabled' | 'critical-files';
} | {
    kind: 'tests-only';
    affectedConfigPaths: ReadonlySet<string>;
} | {
    kind: 'dependency-tree';
    affectedModuleIds: ReadonlySet<string>;
};
/**
 * Decide which Scout testing scope to apply for a given diff.
 *
 * Decision tree (only when `selectiveTesting` is true and `codeChanges` is set):
 *   1. Critical Scout files touched      -> { kind: 'full', reason: 'critical-files' }
 *   2. Diff is exclusively Scout tests   -> { kind: 'tests-only', affectedConfigPaths }
 *   3. Otherwise                         -> { kind: 'dependency-tree', affectedModuleIds }
 *
 * When selective testing is disabled OR no code-changes file was provided, the
 * scope is `{ kind: 'full', reason: 'selective-disabled' }`. Per-item `isAffected`
 * marking is NOT part of the scope — consumers derive it from
 * `codeChanges.affectedModules` independently.
 */
export declare const resolveScoutTestingScope: (codeChanges: CodeChanges | null, selectiveTesting: boolean, log: ToolingLog, repoRoot?: string) => ScoutTestingScope;
/**
 * JSON shape produced by `scout resolve-testing-scope` and read by every
 * downstream step (configs CLI, lanes CLI).
 *
 * Field semantics:
 *   - `kind` / `reason` : the decision (mirrors ScoutTestingScope).
 *   - `affectedModules` : ALWAYS present (sorted, possibly empty). Used both as
 *                         the dependency-tree filter set AND for generic
 *                         "isAffected" labeling regardless of kind.
 *   - `affectedConfigs` : present only when `kind === 'tests-only'`; the exact
 *                         set of Playwright configs to run.
 */
export interface SerializedScoutTestingScope {
    kind: ScoutTestingScope['kind'];
    reason?: 'selective-disabled' | 'critical-files';
    affectedModules: readonly string[];
    affectedConfigs?: readonly string[];
}
/**
 * Convert a `ScoutTestingScope` into the JSON shape shared across pipeline
 * steps. `affectedModules` is always included (even for `full` / `tests-only`
 * scopes) so consumers can label items as "affected" regardless of kind.
 */
export declare const serializeScoutTestingScope: (scope: ScoutTestingScope, affectedModules: ReadonlySet<string>) => SerializedScoutTestingScope;
/**
 * Write the serialised scope to `outputPath`, creating the parent directory
 * if needed. Called by `scout resolve-testing-scope`.
 */
export declare const writeScoutTestingScope: (scope: ScoutTestingScope, affectedModules: ReadonlySet<string>, outputPath: string) => void;
/**
 * Read and validate a testing-scope JSON file produced by `scout
 * resolve-testing-scope`. Throws on missing/invalid input — downstream
 * consumers must not silently fall back to a wrong mode.
 */
export declare const readScoutTestingScope: (filePath: string) => SerializedScoutTestingScope;
