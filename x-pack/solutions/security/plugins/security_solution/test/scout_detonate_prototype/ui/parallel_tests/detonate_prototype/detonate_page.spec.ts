/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Detonate prototype — end to end through the analyst's surface.
 *
 * What this proves, and nothing weaker: a hash submitted through the page
 * reaches the detonation service, the run walks the worker state machine to
 * completion, and the alerts that run actually produced — endpoint alerts
 * raised by Defend on the detonation VM, and detection alerts raised by rules
 * over them — are visible on the run's detail page.
 *
 * EICAR is used because it is the one sample safe to name in a repository, is
 * detected by Defend, and whose recorded run is a real one. A run that produced
 * no alerts would satisfy a "renders" assertion, so the alert counts are
 * asserted to be non-zero.
 *
 * Requires the `detonate_prototype` Scout server config set, which boots Kibana
 * with `detonatePrototypeEnabled` and a detonation service address.
 */

import { spaceTest, tags } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/ui';

/** Standard EICAR anti-malware test file, SHA-256. Inert, and detected by Defend. */
const EICAR_SHA256 = '275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f';

/** `/app/security` + the prototype's route. */
const DETONATE_APP = 'security/detonate_prototype';

const LIST_PAGE = 'detonatePrototypeListPage';
const SERVICE_UNAVAILABLE = 'detonatePrototypeServiceUnavailable';
const RUNS_TABLE_LINK = 'detonatePrototypeRunsTable-link';
const SAMPLE_HASH_INPUT = 'detonatePrototypeSampleHash';
const TAGS_INPUT = 'detonatePrototypeTags';
const SUBMIT_BUTTON = 'detonatePrototypeSubmitButton';
const SUBMIT_ERROR = 'detonatePrototypeSubmitError';
const DETAIL_PAGE = 'detonatePrototypeDetailPage';
const BACK_TO_RUNS = 'detonatePrototypeBackToRuns';
const STATUS_COMPLETE = 'detonatePrototypeStatus-complete';
const STATUS_FAILED = 'detonatePrototypeStatus-failed';
const ENDPOINT_ALERTS_COUNT = 'detonatePrototypeProductionEndpointAlerts-count';
const DETECTION_ALERTS_COUNT = 'detonatePrototypeProductionDetectionAlerts-count';

/**
 * A detonation is a VM boot, a sample run and an alert harvest. Even replayed
 * from a recording it walks the full worker state machine, so the page needs
 * much longer than a default action timeout to reach a terminal state.
 */
const RUN_COMPLETION_TIMEOUT_MS = 180_000;

spaceTest.describe('Detonate prototype', { tag: [...tags.stateful.classic] }, () => {
  spaceTest.beforeEach(async ({ browserAuth }) => {
    await browserAuth.loginAsPlatformEngineer();
  });

  spaceTest(
    'submits a hash, runs it to completion and shows the alerts it produced',
    async ({ page }) => {
      await page.gotoApp(DETONATE_APP);
      await expect(page.testSubj.locator(LIST_PAGE)).toBeVisible();

      await page.testSubj.fill(SAMPLE_HASH_INPUT, EICAR_SHA256);
      await page.testSubj.click(SUBMIT_BUTTON);

      // An unreachable service otherwise surfaces only as a missing detail
      // page. Name it first so the failure is readable.
      await expect(
        page.testSubj.locator(SERVICE_UNAVAILABLE),
        'the detonation service must be reachable for this suite to mean anything'
      ).toBeHidden();
      await expect(page.testSubj.locator(SUBMIT_ERROR)).toBeHidden();

      // Submitting navigates to the new run's detail page.
      await expect(page.testSubj.locator(DETAIL_PAGE)).toBeVisible();

      // The page polls until the shared completion predicate says the run is
      // over. A failed run also stops polling, so assert success directly
      // rather than "no longer running".
      await expect(page.testSubj.locator(STATUS_COMPLETE)).toBeVisible({
        timeout: RUN_COMPLETION_TIMEOUT_MS,
      });
      await expect(page.testSubj.locator(STATUS_FAILED)).toBeHidden();

      // Real detonation, real alerts: Defend raised endpoint alerts on the VM,
      // and detection rules raised alerts over them.
      const endpointAlerts = Number(await page.testSubj.locator(ENDPOINT_ALERTS_COUNT).innerText());
      const detectionAlerts = Number(
        await page.testSubj.locator(DETECTION_ALERTS_COUNT).innerText()
      );

      expect(endpointAlerts).toBeGreaterThan(0);
      expect(detectionAlerts).toBeGreaterThan(0);
    }
  );

  spaceTest('lists the submitted run and navigates back into it', async ({ page }) => {
    await page.gotoApp(DETONATE_APP);
    await expect(page.testSubj.locator(LIST_PAGE)).toBeVisible();

    await page.testSubj.fill(SAMPLE_HASH_INPUT, EICAR_SHA256);
    await page.testSubj.click(SUBMIT_BUTTON);
    await expect(page.testSubj.locator(DETAIL_PAGE)).toBeVisible();

    await page.testSubj.click(BACK_TO_RUNS);
    await expect(page.testSubj.locator(LIST_PAGE)).toBeVisible();

    const firstRun = page.testSubj.locator(RUNS_TABLE_LINK).first();
    await expect(firstRun).toBeVisible();
    await firstRun.click();

    await expect(page.testSubj.locator(DETAIL_PAGE)).toBeVisible();
  });

  spaceTest('pre-fills the form the way the alert action does', async ({ page }) => {
    // What the "Detonate file" alert action builds: the hash it extracted from
    // the alert document, plus a tag tying the run back to that document.
    const tag = 'detonate.prototype.alert:scout-alert-id';

    await page.gotoApp(DETONATE_APP, { params: { sample_hash: EICAR_SHA256, tags: tag } });

    await expect(page.testSubj.locator(LIST_PAGE)).toBeVisible();
    await expect(page.testSubj.locator(SAMPLE_HASH_INPUT)).toHaveValue(EICAR_SHA256);
    await expect(page.testSubj.locator(TAGS_INPUT)).toContainText(tag);
  });
});
