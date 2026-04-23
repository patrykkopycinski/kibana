/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Client } from '@elastic/elasticsearch';
import { ToolingLog } from '@kbn/tooling-log';
import { evaluateReasoning } from '../src/evaluate_reasoning';

/**
 * Standalone CLI for the ARGUS Reasoning Eval Vertical (R11).
 *
 * Mirrors `run_detection_eval.ts` — the Playwright suite runs this same
 * code path through the `@kbn/evals` fixture; this CLI exists so a demo or
 * an Elastic Agent cron job can invoke it without a Scout stack.
 *
 *   $ node scripts/run_reasoning_eval.js \
 *         --es-url http://localhost:9200 --since now-6h
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
  since: string;
  runId?: string;
  traceIndex: string;
  runsIndex: string;
  suiteId: string;
}

const parseArgs = (argv: readonly string[]): CliOptions => {
  const opts: CliOptions = {
    esUrl: process.env.ES_URL ?? 'http://localhost:9200',
    esUser: process.env.ES_USER ?? 'elastic',
    esPass: process.env.ES_PASS ?? 'changeme',
    since: 'now-24h',
    traceIndex: '.soc-reasoning-trace',
    runsIndex: '.soc-argus-eval-runs',
    suiteId: 'argus-reasoning-vertical',
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
      case '--since':
        opts.since = next;
        i += 1;
        break;
      case '--run-id':
        opts.runId = next;
        i += 1;
        break;
      case '--trace-index':
        opts.traceIndex = next;
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
      case '--help':
      case '-h':
        /* eslint-disable no-console */
        console.log(
          [
            'Usage: run_reasoning_eval.ts [options]',
            '',
            'Options:',
            '  --es-url <url>           Elasticsearch URL (default http://localhost:9200)',
            '  --es-user <user>         Elasticsearch user',
            '  --es-pass <pass>         Elasticsearch password',
            '  --since <time>           Relative time floor (default now-24h)',
            '  --run-id <id>            Filter to a single trace run_id',
            '  --trace-index <index>    Source trace index (default .soc-reasoning-trace)',
            '  --runs-index <index>     Destination runs index (default .soc-argus-eval-runs)',
            '  --suite-id <id>          Suite identifier (default argus-reasoning-vertical)',
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
    `[argus-reasoning-cli] connecting to ${opts.esUrl} as ${opts.esUser} (since=${opts.since})`
  );
  const esClient = new Client({
    node: opts.esUrl,
    auth: { username: opts.esUser, password: opts.esPass },
    tls: { rejectUnauthorized: false },
  });

  try {
    const row = await evaluateReasoning(
      { esClient, log },
      {
        since: opts.since,
        runId: opts.runId,
        traceIndex: opts.traceIndex,
        runsIndex: opts.runsIndex,
        suiteId: opts.suiteId,
      }
    );
    log.info(
      `[argus-reasoning-cli] gate=${row.gate_decision} spans=${
        row.spans_evaluated
      } mean_safety=${row.aggregate.mean.safety.toFixed(2)}`
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
