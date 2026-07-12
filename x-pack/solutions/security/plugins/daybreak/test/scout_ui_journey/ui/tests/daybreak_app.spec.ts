/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import { tags } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/ui';
import { createProposalClient } from '../../../../server/client/proposals/client';
import type { ProposalProperties } from '../../../../server/client/proposals/types';
import { test, testData } from '../fixtures';

/**
 * Minimal no-op {@link Logger} for seeding through `createProposalClient()`
 * in this Playwright/Scout context (no Jest globals available here, so
 * `@kbn/logging-mocks`'s `jest.fn()`-based `loggerMock` cannot be used).
 */
const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  trace: () => {},
  fatal: () => {},
  log: () => {},
  get: () => noopLogger,
  isLevelEnabled: () => false,
};

/**
 * End-to-end journey through the real, wired Daybreak application shell
 * (FR-012, FR-014, FR-017, FR-020) — no mocked hooks or seeded component
 * fixtures, unlike the Jest unit suites for `shell.tsx`, `brief_dashboard.tsx`,
 * and `approval_gate.tsx`. Proposals are seeded through the real
 * `createProposalClient()` (the same `StorageIndexAdapter`-backed client the
 * HTTP routes use — there is no `POST /proposals` HTTP route yet, see
 * `fixtures/constants.ts`), then the browser renders them via the real
 * `GET /api/daybreak/proposals` route and the real
 * `POST /api/daybreak/proposals/{id}/transition` route (FR-023).
 *
 * Seeding MUST go through `createProposalClient()` rather than a raw
 * `esClient.index()` call against the `.kibana-daybreak-proposals` alias
 * name: on a fresh cluster, a raw write to that literal name auto-creates a
 * *concrete* index called `.kibana-daybreak-proposals`, and when
 * `StorageIndexAdapter` (used by the real transition route) later tries to
 * establish that same name as an *alias* (`is_write_index: true`), ES
 * rejects it with `invalid_alias_name_exception` — silently breaking every
 * subsequent write through the real client/route. Routing the seed through
 * `createProposalClient()` runs the adapter's own
 * `validateComponentsBeforeWriting` first, so the template/index/alias are
 * provisioned correctly before any assertion or HTTP call depends on them.
 *
 * Covers:
 *  - FR-020: the shell rail renders every seeded Proposal, populated from the
 *    real HTTP API (no loading placeholder once resolved).
 *  - FR-012: selecting a rail item renders the Proposal detail in the stage,
 *    including the wired `ApprovalGate` (FR-016) — confirms `shell.tsx`
 *    actually mounts `ApprovalGate`, not just its own Jest fixture.
 *  - FR-014: the Brief dashboard (rendered when no Proposal is selected)
 *    buckets the seeded Proposals into open threads / awaiting review / next
 *    actions — confirms `shell.tsx` actually mounts `BriefDashboard`.
 *  - FR-017: clicking "Approve" on a gate-ready Proposal (evidence +
 *    recommendation present) POSTs the real transition route, which calls
 *    the real fail-closed `evaluateReadinessGate`, and the UI reflects the
 *    resulting `approved` status without a page reload.
 */
test.describe(
  'Daybreak application (FR-012, FR-014, FR-017, FR-020)',
  { tag: tags.deploymentAgnostic },
  () => {
    const runId = Date.now();
    const readyProposalId = `daybreak-journey-ready-${runId}`;
    const partialProposalId = `daybreak-journey-partial-${runId}`;
    const terminalProposalId = `daybreak-journey-terminal-${runId}`;
    const seededIds = [readyProposalId, partialProposalId, terminalProposalId];

    const seedProposal = async (
      esClient: import('@kbn/scout-security').EsClient,
      overrides: Partial<ProposalProperties> & Pick<ProposalProperties, 'id' | 'title' | 'status'>
    ) => {
      const proposalClient = createProposalClient({
        space: testData.DEFAULT_SPACE,
        logger: noopLogger,
        esClient,
      });

      await proposalClient.create({
        capability: 'alert-analysis',
        severity: 'high',
        confidence: 0.82,
        evidenceRefs: [],
        ...overrides,
      });
    };

    test.beforeAll(async ({ esClient }) => {
      // Gate-ready: non-empty evidenceRefs AND a non-empty recommendation —
      // passes `evaluateReadinessGate` for the `approved` transition
      // (server/client/proposals/gate.ts:62), so the shell's ApprovalGate
      // renders the "approval-required" tier with an enabled Approve button.
      await seedProposal(esClient, {
        id: readyProposalId,
        title: 'Suspicious login from new device',
        status: 'needs-evidence',
        evidenceRefs: [`${readyProposalId}-evidence-1`],
        recommendation: 'Block the source IP and force a password reset.',
      });

      // Partial: evidence only, no recommendation — fails the gate, so it
      // shows up in the Brief dashboard's open threads but not awaiting
      // review or next actions (mirrors `computeBriefSections`'s bucketing).
      await seedProposal(esClient, {
        id: partialProposalId,
        title: 'Unusual outbound data transfer',
        status: 'new',
        evidenceRefs: [`${partialProposalId}-evidence-1`],
      });

      // Terminal: already approved — excluded from the Brief dashboard's
      // open-threads bucket (mirrors `TERMINAL_STATUSES` in
      // `brief_dashboard.tsx`), included in the rail regardless of status.
      await seedProposal(esClient, {
        id: terminalProposalId,
        title: 'Already-resolved brute force attempt',
        status: 'approved',
        evidenceRefs: [`${terminalProposalId}-evidence-1`],
        recommendation: 'Already blocked.',
      });
    });

    test.beforeEach(async ({ browserAuth, pageObjects }) => {
      await browserAuth.loginAsPrivilegedUser();
      await pageObjects.daybreak.goto();
      await pageObjects.daybreak.waitUntilLoaded();
    });

    test.afterAll(async ({ esClient }) => {
      for (const id of seededIds) {
        await esClient
          .deleteByQuery({
            index: testData.DAYBREAK_PROPOSALS_ALIAS,
            refresh: true,
            query: { term: { id } },
          })
          .catch(() => {});
      }
    });

    test('renders every seeded Proposal in the rail from the real HTTP API (FR-020)', async ({
      pageObjects,
    }) => {
      await expect(pageObjects.daybreak.shell).toBeVisible();
      await expect(pageObjects.daybreak.railList).toBeVisible();

      for (const id of seededIds) {
        await expect(pageObjects.daybreak.railItem(id)).toBeVisible();
      }
    });

    test('the Brief dashboard buckets seeded Proposals into open threads and awaiting review (FR-014)', async ({
      page,
    }) => {
      const briefDashboard = page.testSubj.locator('daybreakBriefDashboard');
      await expect(briefDashboard).toBeVisible();

      // Open threads: the two non-terminal proposals (ready + partial), the
      // terminal (approved) one excluded.
      await expect(
        page.testSubj.locator(`daybreakBriefOpenThreadsItem-${readyProposalId}`)
      ).toBeVisible();
      await expect(
        page.testSubj.locator(`daybreakBriefOpenThreadsItem-${partialProposalId}`)
      ).toBeVisible();
      await expect(
        page.testSubj.locator(`daybreakBriefOpenThreadsItem-${terminalProposalId}`)
      ).toHaveCount(0);

      // Awaiting review: only the gate-ready proposal (evidence AND recommendation).
      await expect(
        page.testSubj.locator(`daybreakBriefAwaitingReviewItem-${readyProposalId}`)
      ).toBeVisible();
      await expect(
        page.testSubj.locator(`daybreakBriefAwaitingReviewItem-${partialProposalId}`)
      ).toHaveCount(0);
    });

    test('selecting a rail item renders its Proposal detail and gate in the stage (FR-012, FR-016)', async ({
      pageObjects,
      page,
    }) => {
      await pageObjects.daybreak.selectProposal(readyProposalId);

      await expect(pageObjects.daybreak.proposalDetail).toBeVisible();
      await expect(page.testSubj.locator('daybreakGateApproval')).toBeVisible();
      await expect(page.testSubj.locator('daybreakGateTierBadge-approval-required')).toBeVisible();
      await expect(page.testSubj.locator('daybreakGateApproveButton')).toBeVisible();
    });

    test('approving a gate-ready Proposal transitions it to approved via the real readiness gate (FR-017)', async ({
      pageObjects,
      page,
    }) => {
      await pageObjects.daybreak.selectProposal(readyProposalId);

      const approveButton = page.testSubj.locator('daybreakGateApproveButton');
      await expect(approveButton).toBeVisible();
      await approveButton.click();

      await expect(page.testSubj.locator('daybreakGateApprovalStatus-approved')).toBeVisible();
      await expect(page.testSubj.locator('daybreakGateApproveButton')).toHaveCount(0);
      await expect(page.testSubj.locator('daybreakGateApprovalFailure')).toHaveCount(0);
    });
  }
);
