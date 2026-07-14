/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Write spike-canonical ratification packet JSON to Kibana repo data/.
 *
 *   yarn tsx x-pack/solutions/security/plugins/daybreak/scripts/export_ratification_packet.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRatificationPacket } from '../server/common/contracts/ratification_packet';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(__dirname, '..');
const KIBANA_ROOT = path.resolve(PLUGIN_ROOT, '../../../../..');
const OUT_DIR = path.join(KIBANA_ROOT, 'data/ratification-packet');

const packet = buildRatificationPacket();

mkdirSync(OUT_DIR, { recursive: true });

const writeJson = (name: string, value: unknown) => {
  writeFileSync(path.join(OUT_DIR, name), `${JSON.stringify(value, null, 2)}\n`);
};

writeJson('ratification-packet.json', packet);
writeJson('golden-proposal-fpr.json', packet.goldenExamples.proposalFprDismiss);
writeJson('golden-proposal-ad.json', packet.goldenExamples.proposalAdContinuation);
writeJson('golden-proposal-approved.json', packet.goldenExamples.proposalApprovedForAct);
writeJson('golden-evidence-fpr-alert.json', packet.goldenExamples.evidenceFprAlert);
writeJson('golden-evidence-ad-source.json', packet.goldenExamples.evidenceAdSource);
writeJson('cwl-stub-pairs.json', packet.cwlStubPairs);
writeJson('field-decisions.json', packet.fieldDecisions);
writeJson('unknowns-matrix.json', packet.unknowns);

console.log(`[ratification-packet] Wrote ${OUT_DIR}/`);
console.log(`  field decisions: ${packet.fieldDecisions.length}`);
console.log(`  unknowns: ${packet.unknowns.length}`);
console.log(`  cwl stub pairs: ${packet.cwlStubPairs.length}`);
