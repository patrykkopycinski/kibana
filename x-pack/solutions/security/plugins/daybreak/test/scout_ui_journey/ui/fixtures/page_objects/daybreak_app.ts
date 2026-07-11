/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutPage, Locator } from '@kbn/scout-security';

/**
 * Page object for the Daybreak application shell (FR-010, FR-012, FR-014,
 * FR-020). Wraps navigation and locator access only — assertions stay in the
 * spec files per the scout-ui-testing convention.
 */
export class DaybreakApp {
  public readonly shell: Locator;
  public readonly rail: Locator;
  public readonly railList: Locator;
  public readonly railLoading: Locator;
  public readonly railEmpty: Locator;
  public readonly stage: Locator;
  public readonly stageEmpty: Locator;
  public readonly proposalDetail: Locator;
  public readonly composer: Locator;

  constructor(private readonly page: ScoutPage) {
    this.shell = this.page.testSubj.locator('daybreakAppShell');
    this.rail = this.page.testSubj.locator('daybreakRail');
    this.railList = this.page.testSubj.locator('daybreakRailList');
    this.railLoading = this.page.testSubj.locator('daybreakRailLoading');
    this.railEmpty = this.page.testSubj.locator('daybreakRailEmpty');
    this.stage = this.page.testSubj.locator('daybreakStage');
    this.stageEmpty = this.page.testSubj.locator('daybreakStageEmpty');
    this.proposalDetail = this.page.testSubj.locator('daybreakProposalDetail');
    this.composer = this.page.testSubj.locator('daybreakComposer');
  }

  /** Navigates to the top-level Daybreak application route (FR-010). */
  async goto() {
    await this.page.gotoApp('daybreak');
  }

  /** Waits for the shell to finish its initial load (rail no longer showing the loading spinner). */
  async waitUntilLoaded() {
    await this.railLoading.waitFor({ state: 'detached' }).catch(() => {});
    await this.shell.waitFor({ state: 'visible' });
  }

  /** Locator for a single rail list item, keyed by Proposal id (FR-012). */
  railItem(proposalId: string): Locator {
    return this.page.testSubj.locator(`daybreakRailItem-${proposalId}`);
  }

  /** Clicks a rail item and waits for its detail panel to render in the stage (FR-012). */
  async selectProposal(proposalId: string) {
    await this.railItem(proposalId).click();
    await this.proposalDetail.waitFor({ state: 'visible' });
  }
}
