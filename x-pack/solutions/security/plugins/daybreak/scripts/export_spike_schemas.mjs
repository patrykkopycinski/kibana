/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Export spike-canonical schema versions + key field contracts for #17942 ratification diff.
 *
 * Usage (from Kibana repo root):
 *   node x-pack/solutions/security/plugins/daybreak/scripts/export_spike_schemas.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(__dirname, '..');
const KIBANA_ROOT = path.resolve(PLUGIN_ROOT, '../../../../..');
const versionsPath = path.join(PLUGIN_ROOT, 'server/common/schemas/versions.ts');

const readVersionConst = (name) => {
  const text = readFileSync(versionsPath, 'utf8');
  const match = text.match(new RegExp(`export const ${name} = '([^']+)'`));
  if (!match) {
    throw new Error(`Could not read ${name} from versions.ts`);
  }
  return match[1];
};

const exportDoc = {
  generatedAt: new Date().toISOString(),
  ownership: readVersionConst('SCHEMA_OWNERSHIP'),
  defaultAlertAnalysisWorkerId: readVersionConst('DEFAULT_ALERT_ANALYSIS_WORKER_ID'),
  entities: {
    proposal: {
      schemaVersion: readVersionConst('DAYBREAK_PROPOSAL_SCHEMA_VERSION'),
      index: '.kibana-daybreak-proposals',
      module: 'server/common/schemas/proposal_builder.ts',
    },
    evidence: {
      schemaVersion: readVersionConst('DAYBREAK_EVIDENCE_SCHEMA_VERSION'),
      index: '.kibana-daybreak-evidence',
      module: 'server/common/schemas/evidence_package.ts',
    },
    investigation: {
      schemaVersion: readVersionConst('DAYBREAK_INVESTIGATION_SCHEMA_VERSION'),
      index: '.kibana-daybreak-investigations',
      module: 'server/common/schemas/investigation_builder.ts',
    },
    sse: {
      schemaVersion: readVersionConst('DAYBREAK_SSE_SCHEMA_VERSION'),
      index: '.kibana-daybreak-sse',
      module: 'server/common/schemas/sse_builder.ts',
    },
    actionResult: {
      schemaVersion: readVersionConst('DAYBREAK_ACTION_RESULT_SCHEMA_VERSION'),
      index: '.kibana-daybreak-action-results',
      module: 'server/common/schemas/action_result_builder.ts',
    },
    workerRef: {
      schemaVersion: readVersionConst('DAYBREAK_WORKER_REF_SCHEMA_VERSION'),
      module: 'server/common/schemas/worker_ref.ts',
    },
  },
  adapters: {
    attackDiscovery: 'server/common/schemas/attack_discovery_adapter.ts',
    hunt: 'server/common/schemas/hunt_adapter.ts',
    watchFloorContract: 'server/common/schemas/watch_floor_contract.ts',
  },
  ratificationEpic: 'elastic/security-team#17942',
};

const dataDir = path.join(KIBANA_ROOT, 'data');
mkdirSync(dataDir, { recursive: true });
const outPath = path.join(dataDir, 'daybreak-spike-schema-export.json');
writeFileSync(outPath, `${JSON.stringify(exportDoc, null, 2)}\n`);
console.log(`[schema-export] Wrote ${outPath}`);
