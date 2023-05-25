/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { run } from '@kbn/dev-cli-runner';
import yargs from 'yargs';
import _ from 'lodash';
import globby from 'globby';
import pMap from 'p-map';
import { ToolingLog } from '@kbn/tooling-log';
import { withProcRunner } from '@kbn/dev-proc-runner';
import cypress from 'cypress';

import { createFailError } from '@kbn/dev-cli-errors';
import { renderSummaryTable } from './print_run';

const retrieveIntegrations = (
  specPattern: string[],
  chunksTotal: number = process.env.BUILDKITE_PARALLEL_JOB_COUNT
    ? parseInt(process.env.BUILDKITE_PARALLEL_JOB_COUNT, 10)
    : 1,
  chunkIndex: number = process.env.BUILDKITE_PARALLEL_JOB
    ? parseInt(process.env.BUILDKITE_PARALLEL_JOB, 10)
    : 0
) => {
  const integrationsPaths = globby.sync(specPattern);
  const chunkSize = Math.ceil(integrationsPaths.length / chunksTotal);

  return _.chunk(integrationsPaths, chunkSize)[chunkIndex];
};

export const cli = () => {
  run(
    async () => {
      const { argv } = yargs(process.argv.slice(2));

      const cypressConfigFile = await import(require.resolve(`../../${argv.configFile}`));
      const spec: string | undefined = argv?.spec as string;
      const files = retrieveIntegrations(
        spec
          ? spec.includes(',')
            ? spec.split(',')
            : [spec]
          : cypressConfigFile?.e2e?.specPattern
          ? cypressConfigFile?.e2e?.specPattern
          : [
              // 'cypress/e2e/cases/creation.cy.ts',
              // 'cypress/e2e/cases/privileges.cy.ts',
              '**/cypress/e2e/cases/*.cy.ts',
              '**/cypress/e2e/dashboards/*.cy.ts',
              '**/cypress/e2e/detection_alerts/*.cy.ts',
              // '**/cypress/e2e/detection_rules/*.cy.ts',
            ]
      );

      if (!files.length) {
        throw new Error('No files found');
      }

      const log = new ToolingLog({
        level: 'info',
        writeTo: process.stdout,
      });

      const isOpen = argv._[0] === 'open';

      await pMap(
        [files[0]],
        async (filePath) => {
          let result:
            | CypressCommandLine.CypressRunResult
            | CypressCommandLine.CypressFailedRunResult
            | undefined;
          await withProcRunner(log, async (procs) => {
            if (isOpen) {
              await cypress.open({
                configFile: require.resolve(`../../${argv.configFile}`),
                config: {
                  e2e: {
                    baseUrl: `http://google.com`,
                  },
                },
              });
            } else {
              try {
                result = await cypress.run({
                  browser: 'chrome',
                  spec: filePath,
                  configFile: argv.configFile as string,
                  reporter: argv.reporter as string,
                  reporterOptions: argv.reporterOptions,
                  config: {
                    e2e: {
                      baseUrl: 'http://google.com',
                    },
                    numTestsKeptInMemory: 0,
                  },
                });
              } catch (error) {
                result = error;
              }
            }

            return result;
          });
          return result;
        },
        { concurrency: !isOpen ? 1 : 1 }
      ).then((results) => {
        renderSummaryTable(results as CypressCommandLine.CypressRunResult[]);
        const hasFailedTests = _.some(
          results,
          (result) => result?.status === 'finished' && result.totalFailed > 0
        );
        if (hasFailedTests) {
          throw createFailError('Not all tests passed');
        }
      });
    },
    {
      flags: {
        allowUnexpected: true,
      },
    }
  );
};
