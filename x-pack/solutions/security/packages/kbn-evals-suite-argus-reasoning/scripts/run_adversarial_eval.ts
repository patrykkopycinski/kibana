/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Client } from '@elastic/elasticsearch';
import { ToolingLog } from '@kbn/tooling-log';
import { evaluateAdversarial } from '../src/adversarial/evaluate_adversarial';

/**
 * Standalone CLI for the ARGUS Adversarial Eval Vertical (R2).
 *
 * Mirrors `run_reasoning_eval.ts`. Runs the canned prompt-injection corpus
 * offline (no LLM connector required) and indexes a single
 * `argus-adversarial-vertical` row into `.soc-argus-eval-runs` so the
 * trust-tier assessor picks up the gate decision on its next tick.
 *
 *   $ node scripts/run_adversarial_eval.js \
 *         --es-url http://localhost:9200 --include-unsafe-baselines
 */

class CliExit extends Error {
  constructor(public readonly exitCode: number) {
    super(`CLI exit ${exitCode}`);
  }
}

interface CliOptions {
  esUrl: string;
  esUser: string;
  esPass: string;
  runsIndex: string;
  suiteId: string;
  caseIds?: string[];
  includeUnsafeBaselines: boolean;
}

const parseArgs = (argv: readonly string[]): CliOptions => {
  const opts: CliOptions = {
    esUrl: process.env.ES_URL ?? 'http://localhost:9200',
    esUser: process.env.ES_USER ?? 'elastic',
    esPass: process.env.ES_PASS ?? 'changeme',
    runsIndex: '.soc-argus-eval-runs',
    suiteId: 'argus-adversarial-vertical',
    includeUnsafeBaselines: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--es-url':
        opts.esUrl = next;
        i += 1;
        break;
      case '--es-user':
        opts.esUser = next;
        i += 1;
        break;
      case '--es-pass':
        opts.esPass = next;
        i += 1;
        break;
      case '--runs-index':
        opts.runsIndex = next;
        i += 1;
        break;
      case '--suite-id':
        opts.suiteId = next;
        i += 1;
        break;
      case '--case-ids':
        opts.caseIds = next
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        i += 1;
        break;
      case '--include-unsafe-baselines':
        opts.includeUnsafeBaselines = true;
        break;
      case '--help':
      case '-h':
        /* eslint-disable no-console */
        console.log(
          [
            'Usage: run_adversarial_eval.ts [options]',
            '',
            'Options:',
            '  --es-url <url>                 Elasticsearch URL (default http://localhost:9200)',
            '  --es-user <user>               Elasticsearch user',
            '  --es-pass <pass>               Elasticsearch password',
            '  --runs-index <index>           Destination runs index (default .soc-argus-eval-runs)',
            '  --suite-id <id>                Suite identifier (default argus-adversarial-vertical)',
            '  --case-ids <csv>               Comma-separated subset of corpus case ids to run',
            '  --include-unsafe-baselines     Include adv-99-* negative baselines (for debugging the judge)',
          ].join('\n')
        );
        /* eslint-enable no-console */
        throw new CliExit(0);
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unknown argument: ${arg}`);
        }
        break;
    }
  }
  return opts;
};

const main = async (): Promise<void> => {
  const opts = parseArgs(process.argv.slice(2));
  const log = new ToolingLog({ level: 'info', writeTo: process.stdout });

  log.info(
    `[argus-adversarial-cli] connecting to ${opts.esUrl} as ${opts.esUser} (suite=${opts.suiteId})`
  );
  const esClient = new Client({
    node: opts.esUrl,
    auth: { username: opts.esUser, password: opts.esPass },
    tls: { rejectUnauthorized: false },
  });

  try {
    const row = await evaluateAdversarial(
      { esClient, log },
      {
        runsIndex: opts.runsIndex,
        suiteId: opts.suiteId,
        caseIds: opts.caseIds,
        includeUnsafeBaselines: opts.includeUnsafeBaselines,
      }
    );
    log.info(
      `[argus-adversarial-cli] gate=${row.gate_decision} cases=${row.cases_evaluated} ` +
        `mean_injection_detected=${row.aggregate.mean.injection_detected.toFixed(2)} ` +
        `min_no_secret_leakage=${row.aggregate.min.no_secret_leakage.toFixed(2)}`
    );
  } finally {
    await esClient.close();
  }
};

main().catch((error) => {
  if (error instanceof CliExit) {
    process.exitCode = error.exitCode;
    return;
  }
  /* eslint-disable no-console */
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  /* eslint-enable no-console */
  process.exitCode = 1;
});
