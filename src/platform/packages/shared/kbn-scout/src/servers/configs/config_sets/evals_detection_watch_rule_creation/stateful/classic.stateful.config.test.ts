/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { servers } from './classic.stateful.config';

/**
 * Pins the flags the detection-watch-rule-creation suite needs at boot. Each one enables
 * something that is off by default, and a missing one fails late: Kibana boots, the specs
 * start, and only the managed-workflow lookup fails with `404 Workflow not found`.
 */
describe('evals_detection_watch_rule_creation config set', () => {
  const serverArgs = servers.kbnTestServer.serverArgs;

  it.each([
    // Since #295215 alertzero installs no managed workflows without service accounts.
    '--xpack.security.serviceAccounts.enabled=true',
    // alertzero installs the rule-creation workflow at start.
    '--xpack.alertzero.enabled=true',
    // Required plugins of alertzero; without either, Kibana cascade-disables alertzero.
    '--xpack.agenticInvestigations.enabled=true',
    // Also the API the approval-gate specs decide the proposal through.
    '--xpack.proposals.enabled=true',
    // Registers the `security.rule` attachment the workflow's attach_draft step writes.
    '--xpack.securitySolution.enableExperimental=["rulePreviewAttachmentEnabled"]',
    '--uiSettings.overrides.workflows:ui:enabled=true',
    '--uiSettings.overrides.workflows:aiAgent:enabled=true',
  ])('sets %s', (flag) => {
    expect(serverArgs).toContain(flag);
  });
});
