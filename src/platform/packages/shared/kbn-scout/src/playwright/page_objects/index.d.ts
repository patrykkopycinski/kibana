import type { ScoutPage } from '..';
import type { ScoutLogger } from '../../common';
import type { ScoutTestConfig } from '../../types';
import { Chrome } from './chrome';
import { CollapsibleNav } from './collapsible_nav';
import { DashboardApp } from './dashboard_app';
import { DataGrid } from './data_grid';
import { DataViewsManagementPage } from './data_views_management_page';
import { DatePicker } from './date_picker';
import { DiscoverApp } from './discover_app';
import { FilterBar } from './filter_bar';
import { MapsPage } from './maps_page';
import { QueryBar } from './query_bar';
import { RenderablePage } from './renderable_page';
import { Toasts } from './toasts';
import { LensApp } from './lens_app';
import { ListingTable } from './listing_table';
import { LoginPage } from './login_page';
import { HomePage } from './home_page';
import { OverlaysPage } from './overlays';
import { SavedObjectSaveModal } from './saved_object_save_modal';
import { VisualizeApp } from './visualize_app';
import { UnifiedTabs } from './unified_tabs';
import { ContentListWrapper, buildContentListSearch, buildContentListUrlRegex } from './content_list';
import type { ContentListUrlState } from './content_list';
import type { KibanaUrl } from '../../common/services/kibana_url';
export { ContentListWrapper, DiscoverApp, FilterBar, DataGrid, DataViewsManagementPage, LensApp, QueryBar, UnifiedTabs, ListingTable, buildContentListSearch, buildContentListUrlRegex, };
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
