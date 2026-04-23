/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Client } from '@elastic/elasticsearch';
import { ToolingLog } from '@kbn/tooling-log';
import { ingestKev } from '../ingest';
import { DEFAULT_CISA_KEV_URL } from '../fetch_feed';

/**
 * Argus R14 — Standalone CLI for CISA KEV feed ingest.
 *
 * This sits next to the Playwright-less CLIs we shipped for the detection
 * and reasoning eval verticals, so an operator can pull the latest KEV
 * catalog from a terminal without a full Scout/Kibana stack:
 *
 *   $ yarn run-argus-kev-ingest
 *     (reads ES_URL / ES_USER / ES_PASS from the shell; defaults to
 *      localhost:9200 with elastic/changeme)
 *
 * The `soc-kev-ingest.yaml` workflow shells out to this CLI on a cron —
 * keeping the HTTPS fetch outside the workflow engine avoids adding a new
 * HTTP egress point to the orchestrator. The workflow then scans for the
 * freshly-indexed advisories and emits a metrics doc.
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
  source: string;
  index: string;
  createOnly: boolean;
}

const parseArgs = (argv: readonly string[]): CliOptions => {
  const opts: CliOptions = {
    esUrl: process.env.ES_URL ?? 'http://localhost:9200',
    esUser: process.env.ES_USER ?? 'elastic',
    esPass: process.env.ES_PASS ?? 'changeme',
    source: process.env.ARGUS_KEV_URL ?? DEFAULT_CISA_KEV_URL,
    index: '.soc-cve-advisories',
    createOnly: false,
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
      case '--source':
        opts.source = next;
        i += 1;
        break;
      case '--index':
        opts.index = next;
        i += 1;
        break;
      case '--create-only':
        opts.createOnly = true;
        break;
      case '--help':
      case '-h':
        /* eslint-disable no-console */
        console.log(
          [
            'Usage: run_kev_ingest.ts [options]',
            '',
            'Options:',
            '  --es-url <url>      Elasticsearch URL (default: http://localhost:9200)',
            '  --es-user <user>    Elasticsearch username (default: elastic)',
            '  --es-pass <pass>    Elasticsearch password (default: changeme)',
            `  --source <url|path> KEV feed source (default: ${DEFAULT_CISA_KEV_URL})`,
            '  --index <name>      Target advisories index (default: .soc-cve-advisories)',
            '  --create-only       Skip advisories that already exist (default: upsert)',
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
    `[argus-kev-ingest-cli] connecting to ${opts.esUrl} as ${opts.esUser}; source=${opts.source}`
  );
  const esClient = new Client({
    node: opts.esUrl,
    auth: { username: opts.esUser, password: opts.esPass },
    tls: { rejectUnauthorized: false },
  });

  try {
    const result = await ingestKev({
      esClient,
      log,
      source: opts.source,
      index: opts.index,
      createOnly: opts.createOnly,
    });
    log.info(
      `[argus-kev-ingest-cli] done — run_id=${result.run_id} indexed=${result.indexed} index=${result.index}`
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
