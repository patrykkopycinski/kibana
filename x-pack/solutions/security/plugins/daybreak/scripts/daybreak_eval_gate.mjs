/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * CI eval gate for the Daybreak offline dataset (Gap #8).
 *
 * 1. Runs jest on server/evals/alert_analysis_eval.test.ts and
 *    server/evals/l4_round_trip.test.ts (when present).
 * 2. Writes data/daybreak-alert-analysis-eval-report.json via generateAndWriteEvalReport.
 * 3. Exits 1 when summary.gatePassed is false.
 *
 * Usage (from Kibana repo root):
 *   node x-pack/solutions/security/plugins/daybreak/scripts/daybreak_eval_gate.mjs
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(__dirname, '..');
const KIBANA_ROOT = path.resolve(PLUGIN_ROOT, '../../../../..');
const JEST_CONFIG = path.join(PLUGIN_ROOT, 'jest.config.js');
const EVAL_DIR = path.join(PLUGIN_ROOT, 'server/evals');
const REPORT_NAME = 'daybreak-alert-analysis-eval-report.json';

const EVAL_TESTS = [
  'server/evals/alert_analysis_eval.test.ts',
  'server/evals/l4_round_trip.test.ts',
].filter((rel) => existsSync(path.join(PLUGIN_ROOT, rel)));

const nvmPrefix =
  'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use 2>/dev/null || true';

function runJest() {
  const patterns = EVAL_TESTS.map((t) => path.basename(t, '.test.ts')).join('|');
  const cmd = `${nvmPrefix} && cd "${KIBANA_ROOT}" && yarn jest --config "${JEST_CONFIG}" --testPathPattern="server/evals/(${patterns})" --no-cache`;

  console.log(`[eval-gate] Running jest: ${EVAL_TESTS.join(', ')}`);
  const result = spawnSync(cmd, { shell: true, stdio: 'inherit', env: process.env });
  if (result.status !== 0) {
    console.error('[eval-gate] Jest failed — aborting before report generation.');
    process.exit(result.status ?? 1);
  }
}

async function writeReport() {
  const loader = path.join(KIBANA_ROOT, 'node_modules/@kbn/babel-register/install');
  const modulePath = path.join(EVAL_DIR, 'generate_eval_report.ts');

  const snippet = `const { generateAndWriteEvalReport } = require(${JSON.stringify(modulePath)}); generateAndWriteEvalReport(${JSON.stringify(REPORT_NAME)}).then(({ report, path: reportPath }) => { console.log(JSON.stringify({ gatePassed: report.summary.gatePassed, path: reportPath, summary: report.summary, schemaVersion: report.schemaVersion, provenance: report.provenance })); }).catch((err) => { console.error(err); process.exit(1); });`;

  const cmd = `${nvmPrefix} && cd "${KIBANA_ROOT}" && node -r "${loader}" -e ${JSON.stringify(snippet)}`;
  const result = spawnSync(cmd, { shell: true, encoding: 'utf8', env: process.env });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    console.error('[eval-gate] Report generation failed.');
    process.exit(result.status ?? 1);
  }

  const lastLine = result.stdout.trim().split('\n').filter(Boolean).pop();
  if (!lastLine) {
    console.error('[eval-gate] No report JSON on stdout.');
    process.exit(1);
  }

  let payload;
  try {
    payload = JSON.parse(lastLine);
  } catch {
    console.error('[eval-gate] Could not parse report output:', lastLine);
    process.exit(1);
  }

  const { summary, path: reportPath, schemaVersion, provenance } = payload;
  console.log('\n[eval-gate] Summary');
  console.log(`  report:      ${reportPath}`);
  console.log(`  schema:      v${schemaVersion}`);
  console.log(`  dataset:     ${summary.datasetName}`);
  console.log(`  nominal:     ${summary.nominalPassed}/${summary.nominalTotal} passed`);
  console.log(`  broken:      ${summary.brokenFailed}/${summary.brokenTotal} failed (expected)`);
  console.log(`  gatePassed:  ${summary.gatePassed}`);
  if (provenance) {
    console.log(
      `  provenance:  model=${provenance.modelId ?? 'n/a'} costBasis=${provenance.costBasis}`
    );
  }

  if (!summary.gatePassed) {
    console.error('\n[eval-gate] FAIL — offline dataset gate did not pass.');
    process.exit(1);
  }

  console.log('\n[eval-gate] PASS — offline dataset gate green.');
}

if (EVAL_TESTS.length === 0) {
  console.error('[eval-gate] No eval test files found under server/evals/.');
  process.exit(1);
}

runJest();
await writeReport();
