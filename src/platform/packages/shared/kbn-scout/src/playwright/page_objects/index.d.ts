/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutPage } from '..';
import type { ScoutLogger } from '../../common';
import type { ScoutTestConfig } from '../../types';
import type { Chrome } from './chrome';
import type { CollapsibleNav } from './collapsible_nav';
import type { DashboardApp } from './dashboard_app';
import { DataGrid } from './data_grid';
import { DataViewsManagementPage } from './data_views_management_page';
import type { DatePicker } from './date_picker';
import { DiscoverApp } from './discover_app';
import { FilterBar } from './filter_bar';
import type { MapsPage } from './maps_page';
import { QueryBar } from './query_bar';
import type { RenderablePage } from './renderable_page';
import type { Toasts } from './toasts';
import { LensApp } from './lens_app';
import { ListingTable } from './listing_table';
import type { LoginPage } from './login_page';
import type { HomePage } from './home_page';
import type { OverlaysPage } from './overlays';
import type { SavedObjectSaveModal } from './saved_object_save_modal';
import type { VisualizeApp } from './visualize_app';
import { UnifiedTabs } from './unified_tabs';
import {
  ContentListWrapper,
  buildContentListSearch,
  buildContentListUrlRegex,
} from './content_list';
import type { ContentListUrlState } from './content_list';
import type { KibanaUrl } from '../../common/services/kibana_url';
export {
  ContentListWrapper,
  DiscoverApp,
  FilterBar,
  DataGrid,
  DataViewsManagementPage,
  LensApp,
  QueryBar,
  UnifiedTabs,
  ListingTable,
  buildContentListSearch,
  buildContentListUrlRegex,
};
export type { ContentListUrlState };
export interface PageObjectsFixtures {
  page: ScoutPage;
  config: ScoutTestConfig;
  log: ScoutLogger;
  kbnUrl: KibanaUrl;
}
export interface PageObjects {
  datePicker: DatePicker;
  dataGrid: DataGrid;
  dataViewsManagement: DataViewsManagementPage;
  discover: DiscoverApp;
  dashboard: DashboardApp;
  filterBar: FilterBar;
  listingTable: ListingTable;
  home: HomePage;
  maps: MapsPage;
  queryBar: QueryBar;
  renderable: RenderablePage;
  chrome: Chrome;
  collapsibleNav: CollapsibleNav;
  toasts: Toasts;
  lens: LensApp;
  login: LoginPage;
  overlays: OverlaysPage;
  visualize: VisualizeApp;
  saveModal: SavedObjectSaveModal;
  unifiedTabs: UnifiedTabs;
}
/**
 * Creates a set of core page objects, each lazily instantiated on first access.
 *
 * @param page - `ScoutPage` instance used for initializing page objects.
 * @returns An object containing lazy-loaded core page objects.
 */
export declare function createCorePageObjects(fixtures: PageObjectsFixtures): PageObjects;
