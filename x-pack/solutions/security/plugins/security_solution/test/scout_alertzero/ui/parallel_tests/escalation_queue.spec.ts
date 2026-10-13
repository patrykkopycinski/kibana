/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout-security/ui';
import type { ScoutPage } from '@kbn/scout-security';
import {
  spaceTest,
  tags,
  seedInvestigationWithOwner,
  seedEscalation,
  linkInvestigation,
  setEscalationStatus,
  listEscalations,
  deleteConversations,
} from '../fixtures';

/**
 * Escalation queue — issue security-team#19927, scenario 2:
 * queue listing/order, row contents, reopen, and summary consistency after
 * linking a new investigation.
 *
 * The queue reads are asserted twice where ordering matters: once on the raw
 * `GET internal/investigations/escalations` response the page consumes, and
 * once on the rendered DOM order, so a client-side re-sort cannot mask a
 * server-side ordering regression.
 */
spaceTest.describe('AlertZero escalations queue', { tag: [...tags.stateful.classic] }, () => {
  let spaceId: string;
  let ownerProfileUid: string;
  const createdConversationIds: string[] = [];

  spaceTest.beforeAll(async ({ kbnClient, scoutSpace }) => {
    spaceId = scoutSpace.id;
    // The AlertZero app is inaccessible until its per-space ui setting is on.
    await scoutSpace.uiSettings.set({ 'securitySolution:enableAlertZero': true });
    const investigation = await seedInvestigationWithOwner(
      kbnClient,
      spaceId,
      'Queue spec anchor investigation'
    );
    ownerProfileUid = investigation.ownerProfileUid;
    createdConversationIds.push(investigation.id);
  });

  spaceTest.afterAll(async ({ kbnClient }) => {
    await deleteConversations(kbnClient, spaceId, createdConversationIds);
  });

  const navigateToQueue = async (page: ScoutPage) => {
    await page.gotoApp('alertzero/escalations', { space: spaceId });
    await expect(page.getByTestId('escalationQueue-open')).toBeVisible();
  };

  /** Saves full-page evidence screenshots into the run's output directory. */
  const snapshot = (
    page: ScoutPage,
    testInfo: { outputPath: (n: string) => string },
    name: string
  ) => page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });

  spaceTest(
    'queue lists escalations most recent first',
    async ({ kbnClient, page, browserAuth }, testInfo) => {
      // Two escalations created in sequence: older first, newer second.
      const older = await seedEscalation(kbnClient, spaceId, {
        linkedInvestigationId: createdConversationIds[0],
        assignees: [ownerProfileUid],
        title: 'Queue spec — older escalation',
      });
      // Bump a moment so updated_at differs deterministically (same-second
      // creation would make ordering ambiguous).
      await page.waitForTimeout(1100);
      const newer = await seedEscalation(kbnClient, spaceId, {
        linkedInvestigationId: createdConversationIds[0],
        assignees: [ownerProfileUid],
        title: 'Queue spec — newer escalation',
      });
      createdConversationIds.push(older, newer);

      await spaceTest.step('server list response is updated_at-desc', async () => {
        const list = await listEscalations(kbnClient, spaceId, 'open');
        const ids = list.results.map((r) => r.id);
        expect(ids).toContain(older);
        expect(ids).toContain(newer);
        const timestamps = list.results.map((r) => Date.parse(r.updated_at));
        const sortedDesc = [...timestamps].sort((a, b) => b - a);
        expect(timestamps).toStrictEqual(sortedDesc);
        // And our two are themselves ordered: newer before older.
        expect(ids.indexOf(newer)).toBeLessThan(ids.indexOf(older));
      });

      await browserAuth.loginAs('admin');
      await navigateToQueue(page);

      await spaceTest.step('rendered queue shows newer escalation first', async () => {
        const newerCard = page.getByTestId(`escalationCard-${newer}`);
        const olderCard = page.getByTestId(`escalationCard-${older}`);
        await expect(newerCard).toBeVisible();
        await expect(olderCard).toBeVisible();
        const newerBox = await newerCard.boundingBox();
        const olderBox = await olderCard.boundingBox();
        expect(newerBox && olderBox).toBeDefined();
        if (!newerBox || !olderBox) throw new Error('boundingBox missing for queue cards');
        expect(newerBox.y).toBeLessThan(olderBox.y);
        await expect(newerCard).toContainText('Queue spec — newer escalation');
      });

      await snapshot(page, testInfo, 'queue-ordering-newest-first');
    }
  );

  spaceTest(
    'queue row shows title, status and linked-investigation count',
    async ({ kbnClient, page, browserAuth }, testInfo) => {
      const invA = await seedInvestigationWithOwner(kbnClient, spaceId, 'Row spec inv A');
      const invB = await seedInvestigationWithOwner(kbnClient, spaceId, 'Row spec inv B');
      const escalationId = await seedEscalation(kbnClient, spaceId, {
        linkedInvestigationId: invA.id,
        assignees: [ownerProfileUid],
        title: 'Queue spec — row contents escalation',
      });
      await linkInvestigation(kbnClient, spaceId, escalationId, invB.id);
      createdConversationIds.push(invA.id, invB.id, escalationId);

      await browserAuth.loginAs('admin');
      await navigateToQueue(page);

      const card = page.getByTestId(`escalationCard-${escalationId}`);
      await expect(card).toBeVisible();

      await spaceTest.step('row shows the escalation title', async () => {
        await expect(card).toContainText('Queue spec — row contents escalation');
      });

      await spaceTest.step('row shows the linked-investigation count (2)', async () => {
        // The LinkedInvestigationsBadge is the row's numeric EuiBadge; its
        // tooltip carries the full "2 linked investigations" label.
        const badge = card.locator('.euiBadge', { hasText: /^\s*2\s*$/ });
        await expect(badge).toHaveCount(1);
      });

      await spaceTest.step(
        'closed escalation renders the Closed badge in the closed bucket',
        async () => {
          await setEscalationStatus(kbnClient, spaceId, escalationId, 'closed');
          await page.reload();
          const closedQueue = page.getByTestId('escalationQueue-closed');
          await expect(closedQueue).toBeVisible();
          const closedCard = closedQueue.getByTestId(`escalationCard-${escalationId}`);
          await expect(closedCard).toBeVisible();
          await expect(closedCard).toContainText('Closed');
          await snapshot(page, testInfo, 'queue-row-closed-bucket');
          // Reopened for teardown consistency.
          await setEscalationStatus(kbnClient, spaceId, escalationId, 'open');
        }
      );
    }
  );

  spaceTest(
    'reopening a closed escalation makes it open and editable again',
    async ({ kbnClient, page, browserAuth }, testInfo) => {
      const escalationId = await seedEscalation(kbnClient, spaceId, {
        linkedInvestigationId: createdConversationIds[0],
        assignees: [ownerProfileUid],
        title: 'Queue spec — reopen escalation',
      });
      createdConversationIds.push(escalationId);

      await setEscalationStatus(kbnClient, spaceId, escalationId, 'closed');

      await spaceTest.step('closed escalation lands in the closed bucket only', async () => {
        const list = await listEscalations(kbnClient, spaceId, 'closed');
        expect(list.results.map((r) => r.id)).toContain(escalationId);
        const open = await listEscalations(kbnClient, spaceId, 'open');
        expect(open.results.map((r) => r.id)).not.toContain(escalationId);
      });

      // The real reopen surface: the per-escalation status route the UI's
      // status toggle calls. There is no GET-by-id escalation route, so the
      // reopen effect is asserted through the queue/list read surface.
      await setEscalationStatus(kbnClient, spaceId, escalationId, 'open');

      await spaceTest.step('reopened escalation is back in the open bucket', async () => {
        const list = await listEscalations(kbnClient, spaceId, 'open');
        expect(list.results.map((r) => r.id)).toContain(escalationId);
        const closed = await listEscalations(kbnClient, spaceId, 'closed');
        expect(closed.results.map((r) => r.id)).not.toContain(escalationId);
      });

      await browserAuth.loginAs('admin');
      await navigateToQueue(page);

      await spaceTest.step(
        'reopened row is present and editable (title link opens the escalation)',
        async () => {
          const card = page.getByTestId(`escalationCard-${escalationId}`);
          await expect(card).toBeVisible();
          const titleLink = card.getByTestId(`escalationCardLink-${escalationId}`);
          await expect(titleLink).toBeVisible();
          // SPA navigation: don't let click() wait for a full page load.
          await titleLink.click({ noWaitAfter: true });
          await page.waitForURL(
            new RegExp(
              `/app/agent_builder/(agents/[^/]+/)?conversations/${escalationId}.*openConversationDetails`
            )
          );
          await snapshot(page, testInfo, 'reopened-escalation-editable-in-agent-builder');
        }
      );
    }
  );

  spaceTest(
    'summary stays consistent after linking a new investigation',
    async ({ kbnClient, page, browserAuth }) => {
      const invA = await seedInvestigationWithOwner(kbnClient, spaceId, 'Consistency inv A');
      const invB = await seedInvestigationWithOwner(kbnClient, spaceId, 'Consistency inv B');
      const escalationId = await seedEscalation(kbnClient, spaceId, {
        linkedInvestigationId: invA.id,
        assignees: [ownerProfileUid],
        title: 'Queue spec — consistency escalation',
      });
      createdConversationIds.push(invA.id, invB.id, escalationId);

      await browserAuth.loginAs('admin');
      await navigateToQueue(page);
      const card = page.getByTestId(`escalationCard-${escalationId}`);
      await expect(card).toContainText('Queue spec — consistency escalation');

      await spaceTest.step(
        'link route appends without dropping the first investigation',
        async () => {
          const linkResponse = await linkInvestigation(kbnClient, spaceId, escalationId, invB.id);
          expect(linkResponse.status).toBe(200);
        }
      );

      await spaceTest.step(
        'queue read reflects both investigations and keeps the title',
        async () => {
          const list = await listEscalations(kbnClient, spaceId, 'all');
          const row = list.results.find((r) => r.id === escalationId);
          expect(row).toBeDefined();
          if (!row) throw new Error(`escalation ${escalationId} missing from queue read`);
          expect(row.title).toBe('Queue spec — consistency escalation');
          expect(row.metadata?.linked_investigations).toStrictEqual(
            expect.arrayContaining([invA.id, invB.id])
          );
          expect(row.metadata?.linked_investigations).toHaveLength(2);
        }
      );

      await spaceTest.step(
        'rendered card still shows the same title after relink + reload',
        async () => {
          await page.reload();
          const cardAfter = page.getByTestId(`escalationCard-${escalationId}`);
          await expect(cardAfter).toContainText('Queue spec — consistency escalation');
        }
      );
    }
  );

  // Contract gap from #19927 scenario 2: the queue row should also show a
  // pending-proposal count. EscalationQueueItem carries no pending-proposal
  // field today (see components/escalation_queue/types.ts); pending proposal
  // counts exist only on the per-escalation linked-investigation summaries.
  spaceTest.fixme('queue row shows pending-proposal count', async () => {
    // Intended: seed an investigation with a pending proposed action, link
    // it, and assert the queue row renders "1 pending proposal". Blocked on
    // the queue view-model exposing the count.
  });
});
