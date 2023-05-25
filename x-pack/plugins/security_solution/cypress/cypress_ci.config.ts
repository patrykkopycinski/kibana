/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import {
  EsVersion,
  FunctionalTestRunner,
  readConfigFile,
  runElasticsearch,
  runKibanaServer,
} from '@kbn/test';
import _ from 'lodash';
import fs from 'fs';
import * as parser from '@babel/parser';
import type {
  ExpressionStatement,
  Identifier,
  ObjectExpression,
  ObjectProperty,
} from '@babel/types';
import deepmerge from 'deepmerge';

import {
  Lifecycle,
  ProviderCollection,
  readProviderSpec,
} from '@kbn/test/src/functional_test_runner/lib';
import { ProcRunner } from '@kbn/dev-proc-runner';

import { defineCypressConfig } from '@kbn/cypress-config';
import { ToolingLog } from '@kbn/tooling-log';
import getPort from 'get-port';
import { getLocalhostRealIp } from '../scripts/endpoint/common/localhost_services';

// eslint-disable-next-line import/no-default-export
export default defineCypressConfig({
  defaultCommandTimeout: 150000,
  execTimeout: 150000,
  pageLoadTimeout: 150000,
  numTestsKeptInMemory: 0,
  retries: {
    runMode: 1,
  },
  screenshotsFolder: '../../../target/kibana-security-solution/cypress/screenshots',
  trashAssetsBeforeRuns: false,
  video: false,
  videosFolder: '../../../target/kibana-security-solution/cypress/videos',
  viewportHeight: 946,
  viewportWidth: 1680,
  e2e: {
    baseUrl: 'http://localhost:5601',
    experimentalMemoryManagement: true,
    specPattern: './cypress/e2e/**/*.cy.ts',
    setupNodeEvents(on, globalConfig) {
      const processes = [];
      on('before:spec', (...arguments) => {
        console.log('details', arguments);
        require('@kbn/babel-register').install();
        return Promise.resolve().then(async () => {
          const abortCtrl = new AbortController();

          const argv = {
            ftrConfigFile: '../../../../../../x-pack/test/security_solution_cypress/cli_config',
          };

          const log = new ToolingLog({
            level: 'info',
            writeTo: process.stdout,
          });

          const onEarlyExit = (msg: string) => {
            log.error(msg);
            abortCtrl.abort();
          };

          const parseTestFileConfig = (
            filePath: string
          ): Record<string, string | number | Record<string, string | number>> | undefined => {
            const testFile = fs.readFileSync(filePath, { encoding: 'utf8' });

            const ast = parser.parse(testFile, {
              sourceType: 'module',
              plugins: ['typescript'],
            });

            const expressionStatement = _.find(ast.program.body, [
              'type',
              'ExpressionStatement',
            ]) as ExpressionStatement | undefined;

            const callExpression = expressionStatement?.expression;
            // @ts-expect-error
            if (expressionStatement?.expression?.arguments?.length === 3) {
              // @ts-expect-error
              const callExpressionArguments = _.find(callExpression?.arguments, [
                'type',
                'ObjectExpression',
              ]) as ObjectExpression | undefined;

              const callExpressionProperties = _.find(callExpressionArguments?.properties, [
                'key.name',
                'env',
              ]) as ObjectProperty[] | undefined;
              // @ts-expect-error
              const ftrConfig = _.find(callExpressionProperties?.value?.properties, [
                'key.name',
                'ftrConfig',
              ]);

              if (!ftrConfig) {
                return {};
              }

              return _.reduce(
                ftrConfig.value.properties,
                (acc: Record<string, string | number | Record<string, string>>, property) => {
                  const key = (property.key as Identifier).name;
                  let value;
                  if (property.value.type === 'ArrayExpression') {
                    value = _.map(property.value.elements, (element) => {
                      if (element.type === 'StringLiteral') {
                        return element.value as string;
                      }
                      return element.value as string;
                    });
                  }
                  if (key && value) {
                    // @ts-expect-error
                    acc[key] = value;
                  }
                  return acc;
                },
                {}
              );
            }
            return undefined;
          };

          const esPort: number = await getPort({
            port: getPort.makeRange(9201, 9299),
          });
          const kibanaPort: number = await getPort({
            port: getPort.makeRange(5602, 5699),
          });
          const fleetServerPort: number = await getPort({
            port: getPort.makeRange(8081, 8099),
          });

          const configFromTestFile = undefined; // parseTestFileConfig(filePath);

          const config = await readConfigFile(
            log,
            EsVersion.getDefault(),
            _.isArray(argv.ftrConfigFile) ? _.last(argv.ftrConfigFile) : argv.ftrConfigFile,
            {
              servers: {
                elasticsearch: {
                  port: esPort,
                },
                kibana: {
                  port: kibanaPort,
                },
                // fleetserver: {
                //   port: fleetServerPort,
                // },
              },
              kbnTestServer: {
                serverArgs: [
                  `--server.port=${kibanaPort}`,
                  `--elasticsearch.hosts=http://localhost:${esPort}`,
                ],
              },
            },
            (vars) => {
              const hasFleetServerArgs = _.some(
                vars.kbnTestServer.serverArgs,
                (value) =>
                  value.includes('--xpack.fleet.agents.fleet_server.hosts') ||
                  value.includes('--xpack.fleet.agents.elasticsearch.host')
              );

              vars.kbnTestServer.serverArgs = _.filter(
                vars.kbnTestServer.serverArgs,
                (value) =>
                  !(
                    value.includes('--elasticsearch.hosts=http://localhost:9220') ||
                    value.includes('--xpack.fleet.agents.fleet_server.hosts') ||
                    value.includes('--xpack.fleet.agents.elasticsearch.host')
                  )
              );

              if (
                // @ts-expect-error
                configFromTestFile?.enableExperimental?.length &&
                _.some(vars.kbnTestServer.serverArgs, (value) =>
                  value.includes('--xpack.securitySolution.enableExperimental')
                )
              ) {
                vars.kbnTestServer.serverArgs = _.filter(
                  vars.kbnTestServer.serverArgs,
                  (value) => !value.includes('--xpack.securitySolution.enableExperimental')
                );
                vars.kbnTestServer.serverArgs.push(
                  `--xpack.securitySolution.enableExperimental=${JSON.stringify(
                    configFromTestFile?.enableExperimental
                  )}`
                );
              }
              const hostRealIp = getLocalhostRealIp();

              if (hasFleetServerArgs) {
                vars.kbnTestServer.serverArgs.push(
                  `--xpack.fleet.agents.fleet_server.hosts=["https://${hostRealIp}:${fleetServerPort}"]`,
                  `--xpack.fleet.agents.elasticsearch.host=http://${hostRealIp}:${esPort}`
                );
              }

              return vars;
            }
          );

          const lifecycle = new Lifecycle(log);

          const providers = new ProviderCollection(log, [
            ...readProviderSpec('Service', {
              lifecycle: () => lifecycle,
              log: () => log,
              config: () => config,
            }),
            ...readProviderSpec('Service', config.get('services')),
          ]);

          const options = {
            installDir: process.env.KIBANA_INSTALL_DIR,
          };

          await runElasticsearch({
            config,
            log,
            name: `ftr-${esPort}`,
            esFrom: 'snapshot',
            onEarlyExit,
          });

          const procs = new ProcRunner(log);

          await runKibanaServer({
            procs,
            config,
            installDir: options?.installDir,
            extraKbnOpts: options?.installDir
              ? []
              : ['--dev', '--no-dev-config', '--no-dev-credentials'],
            onEarlyExit,
          });

          await providers.loadAll();

          const functionalTestRunner = new FunctionalTestRunner(
            log,
            config,
            EsVersion.getDefault()
          );

          const customEnv = await functionalTestRunner.run(abortCtrl.signal);

          pro;
          return deepmerge(globalConfig, {
            e2e: {
              baseUrl: `http://localhost:${kibanaPort}`,
            },
            env: {
              ...customEnv,
              ftrConfig: {
                kibanaPort,
                esPort,
                fleetServerPort,
              },
            },
          });
        });
        // },
      });
    },
  },
});
