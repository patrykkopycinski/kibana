/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Client } from '@elastic/elasticsearch';
import { ToolingLog } from '@kbn/tooling-log';
import { createEsReplayClient } from '../src/replay_rule';
import { createEvaluateDetectionRules } from '../src/evaluate_dataset';
import { MYTHOS_CORPUS_2026_04 } from '../datasets/mythos_corpus_2026_04';

/**
 * Standalone CLI for the Argus Detection Eval Vertical.
 *
 * Why this exists: the Playwright-driven `@kbn/evals` suite requires a fully
 * configured Scout environment (Kibana + Elasticsearch + a connector) to run.
 * That is correct for CI, but demos happen on a laptop with a plain `setup.sh`
 * cluster. This CLI shares 100% of the production path — the same replay
 * client, the same evaluators, the same persistence — just without the
 * Playwright wrapper. So a demo run is:
 *
 *   $ yarn run-argus-detection-eval
 *     (reads ES_URL / ES_USER / ES_PASS from the shell, defaults to
 *      localhost:9200 with elastic/changeme)
 *
 * The CLI is also what the `soc-detection-eval.yaml` workflow can shell out
 * to from an Elastic Agent cron job in environments without Scout.
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
  corpusId: string;
  corpusIndex?: string;
  suiteId: string;
  runsIndex: string;
}

const parseArgs = (argv: readonly string[]): CliOptions => {
  const opts: CliOptions = {
    esUrl: process.env.ES_URL ?? 'http://localhost:9200',
    esUser: process.env.ES_USER ?? 'elastic',
    esPass: process.env.ES_PASS ?? 'changeme',
    corpusId: MYTHOS_CORPUS_2026_04.id,
    corpusIndex: MYTHOS_CORPUS_2026_04.index,
    suiteId: 'argus-detection-vertical',
    runsIndex: '.soc-detection-eval-runs',
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
      case '--corpus-id':
        opts.corpusId = next;
        opts.corpusIndex = `.soc-eval-corpus-${next}`;
        i += 1;
        break;
      case '--corpus-index':
        opts.corpusIndex = next;
        i += 1;
        break;
      case '--suite-id':
        opts.suiteId = next;
        i += 1;
        break;
      case '--runs-index':
        opts.runsIndex = next;
        i += 1;
        break;
      case '--help':
      case '-h':
        /* eslint-disable no-console */
        console.log(
          [
            'Usage: run_detection_eval.ts [options]',
            '',
            'Options:',
            '  --es-url <url>           Elasticsearch URL (default: http://localhost:9200)',
            '  --es-user <user>         Elasticsearch username (default: elastic)',
            '  --es-pass <password>     Elasticsearch password (default: changeme)',
            '  --corpus-id <id>         Corpus identifier (default: argus-corpus-mythos-2026-04)',
            '  --corpus-index <index>   Corpus index (default derived from --corpus-id)',
            '  --suite-id <id>          Suite identifier written to runs (default: argus-detection-vertical)',
            '  --runs-index <index>     Runs index (default: .soc-detection-eval-runs)',
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
    `[argus-deteng-cli] connecting to ${opts.esUrl} as ${opts.esUser} (corpus=${opts.corpusId})`
  );
  const esClient = new Client({
    node: opts.esUrl,
    auth: { username: opts.esUser, password: opts.esPass },
    tls: { rejectUnauthorized: false },
  });

  try {
    const replayClient = createEsReplayClient(esClient);
    const run = createEvaluateDetectionRules({ esClient, replayClient, log });
    const result = await run({
      corpusId: opts.corpusId,
      corpusIndex: opts.corpusIndex,
      suiteId: opts.suiteId,
      runsIndex: opts.runsIndex,
    });

    log.info(
      `[argus-deteng-cli] run complete — run_id=${result.run_id}, rules=${result.rows.length}`
    );
    const passes = result.rows.filter((r) => r.gate_decision === 'pass').length;
    const fails = result.rows.filter((r) => r.gate_decision === 'fail').length;
    const marginal = result.rows.filter((r) => r.gate_decision === 'marginal').length;
    log.info(`[argus-deteng-cli] gate summary: pass=${passes} marginal=${marginal} fail=${fails}`);
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
