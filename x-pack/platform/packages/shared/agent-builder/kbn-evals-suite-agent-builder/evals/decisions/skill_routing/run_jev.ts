/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createJevClient, jevState } from '../lib/jev_client';
import type { JevClient } from '../lib/jev_client';
import { createBm25Ranker } from './bm25';
import type { Catalog, RoutingView } from './catalog';
import { loadCatalog, ROUTING_VIEWS } from './catalog';
import type { JevRaw, OutputResolution } from './cascade';
import {
  buildRoutingItems,
  canonicaliseJevRaw,
  deriveArms,
  runJevRouting,
  SKILL_ROUTING_PATH_ID,
} from './cascade';
import { loadRoutingCases } from './dataset';
import type { FrozenBaselines, ViewReport } from './report';
import {
  assertFrozenBaselines,
  buildViewReport,
  freezeBaselines,
  renderViewMarkdown,
} from './report';

/**
 * Skill-routing eval: the Jev cascade against BM25, a majority constant and oracle ceilings,
 * on the skill-selection benchmark. No Kibana stack is needed; the incumbent pre-selection
 * runs through the evals spec instead, because it needs an EIS connector.
 *
 *   node scripts/run_skill_routing_jev.js --offline       zero-cost arms, asserts frozen numbers
 *   node scripts/run_skill_routing_jev.js --freeze        re-freezes the zero-cost numbers
 *   node scripts/run_skill_routing_jev.js --recompute <raw.json>   rebuilds from a frozen run
 *   JEV_ENABLED=1 JEV_ENABLED_PATHS=AB-SKILL-ROUTING JEV_CAPTURE_DIR=<outside repo> \
 *   TYPESAFE_API_KEY=... SKILL_ROUTING_OUT=<dir> node scripts/run_skill_routing_jev.js
 */

export const FROZEN_BASELINES_FILE = path.join(__dirname, 'frozen_baselines.json');

export interface FrozenRun {
  startedAt: string;
  requestedModel: string;
  /** Raw Jev answers per view, before canonicalisation. */
  jev: Partial<Record<RoutingView, JevRaw[]>>;
}

export interface RoutingRunReport {
  views: ViewReport[];
  datasetResolution: ReturnType<typeof loadRoutingCases>['resolution'];
  outputResolution: Partial<Record<RoutingView, OutputResolution>>;
}

export const buildRoutingReport = (
  catalog: Catalog,
  jev: FrozenRun['jev'] = {}
): RoutingRunReport => {
  const outputResolution: RoutingRunReport['outputResolution'] = {};
  const views = ROUTING_VIEWS.map((view) => {
    const { items, skills, resolver } = buildRoutingItems(catalog, view);
    const raw = jev[view];
    let canonical: JevRaw[] | undefined;
    if (raw) {
      const mapped = canonicaliseJevRaw(raw, resolver);
      canonical = mapped.raw;
      outputResolution[view] = mapped.resolution;
    }
    return buildViewReport({
      view,
      items,
      skills,
      armPredictions: deriveArms({
        items,
        skills,
        view,
        bm25: createBm25Ranker(skills),
        jev: canonical,
      }),
    });
  });
  return { views, datasetResolution: loadRoutingCases(catalog).resolution, outputResolution };
};

export const runJevViews = async (
  client: JevClient,
  catalog: Catalog
): Promise<FrozenRun['jev']> => {
  const jev: FrozenRun['jev'] = {};
  for (const view of ROUTING_VIEWS) {
    const { items, skills } = buildRoutingItems(catalog, view);
    jev[view] = await runJevRouting(client, items, view, skills);
  }
  return jev;
};

const loadFrozenBaselines = (file = FROZEN_BASELINES_FILE): FrozenBaselines | undefined =>
  fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as FrozenBaselines) : undefined;

export const renderRoutingMarkdown = (
  report: RoutingRunReport,
  { title, provenance }: { title: string; provenance: string[] }
): string => {
  const { datasetResolution: resolution, outputResolution } = report;
  return [
    `# ${title}`,
    '',
    ...provenance.map((line) => `- ${line}`),
    `- expected skills: ${resolution.exact} exact, ${
      resolution.canonicalised.length
    } canonicalised (${[
      ...new Set(resolution.canonicalised.map(({ from, to }) => `${from} -> ${to}`)),
    ].join(', ')}), ${resolution.unresolved.length} unresolved; ${
      resolution.noSkillRows
    } benchmark row(s) expect no skill`,
    ...Object.entries(outputResolution).map(
      ([view, r]) =>
        `- Jev output names (${view}): ${r.checked} checked, ${r.exact} exact, ${r.canonicalised.length} canonicalised, ${r.unresolved.length} unresolved`
    ),
    '',
    ...report.views.map(renderViewMarkdown),
  ].join('\n');
};

const write = (outDir: string, stamp: string, name: string, ext: string, content: string) => {
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `skill_routing_${name}_${stamp}.${ext}`);
  fs.writeFileSync(file, content);
  return file;
};

export const main = async (
  argv: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env
): Promise<void> => {
  const catalog = loadCatalog();
  const frozen = loadFrozenBaselines();

  if (argv.includes('--freeze')) {
    const report = buildRoutingReport(catalog);
    fs.writeFileSync(
      FROZEN_BASELINES_FILE,
      `${JSON.stringify(freezeBaselines(report.views), null, 2)}\n`
    );
    process.stdout.write(`froze zero-cost baselines to ${FROZEN_BASELINES_FILE}\n`);
    return;
  }
  if (!frozen) throw new Error(`${FROZEN_BASELINES_FILE} is missing; run with --freeze first`);

  const recomputeAt = argv.indexOf('--recompute');
  let run: FrozenRun | undefined;
  if (recomputeAt >= 0) {
    const file = argv[recomputeAt + 1];
    if (!file) throw new Error('--recompute needs the path of a frozen raw run');
    run = JSON.parse(fs.readFileSync(file, 'utf-8')) as FrozenRun;
  } else if (!argv.includes('--offline')) {
    const { enabled, reason } = jevState(SKILL_ROUTING_PATH_ID, env);
    if (!enabled) {
      throw new Error(
        `Jev is off (${reason}); refusing to run. No request was made. Use --offline for the zero-cost arms.`
      );
    }
    if (!env.SKILL_ROUTING_OUT) {
      throw new Error('SKILL_ROUTING_OUT is required for a live run so the raw answers are frozen');
    }
    const client = createJevClient({ pathId: SKILL_ROUTING_PATH_ID, env });
    const startedAt = new Date().toISOString();
    run = { startedAt, requestedModel: client.model, jev: await runJevViews(client, catalog) };
  }

  const report = buildRoutingReport(catalog, run?.jev);
  assertFrozenBaselines(report.views, frozen);

  const servedModels = [
    ...new Set(
      Object.values(run?.jev ?? {})
        .flat()
        .map(({ servedModel }) => servedModel ?? 'unknown')
    ),
  ];
  const markdown = renderRoutingMarkdown(report, {
    title: 'Agent Builder skill routing: Jev cascade vs lexical and oracle baselines',
    provenance: run
      ? [
          `run started ${run.startedAt}, 1 repetition, one request per item per view`,
          `requested ${run.requestedModel}, served ${servedModels.join(
            ', '
          )}, via TypeSafe direct API (personal key, not EIS-only)`,
          'synthetic benchmark queries; Jev run-to-run noise is about +/-0.05',
          'zero-cost arms reproduce the frozen baselines',
        ]
      : ['offline: zero-cost arms only, reproduce the frozen baselines'],
  });

  const outDir = env.SKILL_ROUTING_OUT;
  if (outDir) {
    const stamp = (run?.startedAt ?? new Date().toISOString()).replace(/[:.]/g, '-');
    if (run && recomputeAt < 0) write(outDir, stamp, 'raw', 'json', JSON.stringify(run, null, 2));
    write(outDir, stamp, 'report', 'json', JSON.stringify(report, null, 2));
    write(outDir, stamp, 'report', 'md', markdown);
  }
  process.stdout.write(`${markdown}\n`);
};
