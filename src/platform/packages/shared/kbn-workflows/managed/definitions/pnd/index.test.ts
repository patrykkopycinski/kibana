/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { PND_WATCH_WORKFLOW_IDS, PND_WATCH_WORKFLOWS } from '.';

/**
 * `PND_WATCH_WORKFLOWS` (definitions) and `PND_WATCH_WORKFLOW_IDS` (what PND's
 * `installStatic` iterates) are hand-maintained sibling lists in this file.
 * Adding a workflow to only the first one type-checks, registers the definition,
 * and still installs nothing: the Watch's workflow saved object never lands in
 * ES, so its run route 404s with no failing test anywhere.
 *
 * That is exactly how `system-security-watch-deep-raw-log-corroboration-worker`
 * shipped absent from a clean cell. These assertions bite on the next omission.
 */
describe('PND managed watch workflow lists', () => {
  it('every definition in PND_WATCH_WORKFLOWS has its id in PND_WATCH_WORKFLOW_IDS', () => {
    const installableIds = new Set<string>(PND_WATCH_WORKFLOW_IDS);
    const notInstallable = PND_WATCH_WORKFLOWS.map(({ id }) => id).filter(
      (id) => !installableIds.has(id)
    );

    expect(notInstallable).toEqual([]);
  });

  it('every id in PND_WATCH_WORKFLOW_IDS has a definition in PND_WATCH_WORKFLOWS', () => {
    const definedIds = new Set<string>(PND_WATCH_WORKFLOWS.map(({ id }) => id));
    const undefinedIds = (PND_WATCH_WORKFLOW_IDS as readonly string[]).filter(
      (id) => !definedIds.has(id)
    );

    expect(undefinedIds).toEqual([]);
  });

  it('has no duplicate ids in either list', () => {
    expect(new Set(PND_WATCH_WORKFLOW_IDS).size).toBe(PND_WATCH_WORKFLOW_IDS.length);
    expect(new Set(PND_WATCH_WORKFLOWS.map(({ id }) => id)).size).toBe(PND_WATCH_WORKFLOWS.length);
  });

  it('includes the deep raw-log corroboration worker as installable', () => {
    expect(PND_WATCH_WORKFLOW_IDS as readonly string[]).toContain(
      'system-security-watch-deep-raw-log-corroboration-worker'
    );
  });
});
