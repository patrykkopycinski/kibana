/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { servers } from './classic.stateful.config';

const DEFAULT_AI_CONNECTOR_ARG = '--uiSettings.overrides.genAiSettings:defaultAIConnector=';

describe('alertzero_eval config set', () => {
  const args = servers.kbnTestServer.serverArgs;

  it('keeps the EIS preconfigured connectors from the agent_builder_smoke base', () => {
    expect(args.some((arg) => arg.startsWith('--xpack.actions.preconfigured='))).toBe(true);
  });

  it('keeps alertzero and the plugins it requires enabled', () => {
    expect(args).toEqual(
      expect.arrayContaining([
        '--xpack.alertzero.enabled=true',
        '--xpack.agenticInvestigations.enabled=true',
        '--xpack.proposals.enabled=true',
      ])
    );
  });

  it('keeps service accounts enabled so alertzero installs its managed workflows', () => {
    expect(args).toContain('--xpack.security.serviceAccounts.enabled=true');
  });

  it('pins the stack default AI connector at most once', () => {
    expect(args.filter((arg) => arg.startsWith(DEFAULT_AI_CONNECTOR_ARG)).length).toBeLessThan(2);
  });
});
