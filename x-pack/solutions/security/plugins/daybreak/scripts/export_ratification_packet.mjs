#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Thin launcher — logic lives in export_ratification_packet.ts (spike builders).
 *
 * Usage (from Kibana repo root):
 *   node x-pack/solutions/security/plugins/daybreak/scripts/export_ratification_packet.mjs
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(__dirname, '..');
const KIBANA_ROOT = path.resolve(PLUGIN_ROOT, '../../../../..');
const runner = path.join(__dirname, 'export_ratification_packet.ts');
const tsx = path.join(KIBANA_ROOT, 'node_modules/.bin/tsx');

const result = spawnSync(process.execPath, [tsx, runner], {
  cwd: KIBANA_ROOT,
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
