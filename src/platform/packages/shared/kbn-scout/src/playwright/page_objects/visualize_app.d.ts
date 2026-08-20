import type { ScoutPage } from '..';
import type { SavedObjectSaveModal } from './saved_object_save_modal';
type VisType = 'lens' | 'vega' | 'metrics' | 'aggbased' | 'maps';
export declare class VisualizeApp {
    private readonly page;
    private readonly landingPage;
    private readonly newItemButton;
    private readonly visNewDialogGroups;
    private readonly visNewDialogTypes;
    private readonly legacyTab;
    private readonly visualizeSaveButton;
    private readonly visualizationLoader;
    private readonly editInLensButton;
    /** Save modal locators/actions, shared with other apps (e.g. Maps) via `SavedObjectSaveModal`. */
    readonly saveModal: SavedObjectSaveModal;
    constructor(page: ScoutPage);
    goto(): Promise<void>;
    openNewVisualizationWizard(): Promise<void>;
    clickLegacyTab(): Promise<void>;
    clickVisType(type: VisType): Promise<void>;
    clickAggBasedType(subType: string): Promise<void>;
    selectDataSource(name: string): Promise<void>;
    waitForVisualizationLoaded(): Promise<void>;
    clickSavedVisualization(title: string): Promise<void>;
    openSavedVisualization(title: string, options?: {
        waitFor?: 'agg' | 'lens';
    }): Promise<void>;
    openSaveModal(): Promise<void>;
    saveToExistingDashboard(visName: string, dashboardTitle: string): Promise<void>;
    saveToNewDashboard(visName: string): Promise<void>;
    saveToLibrary(visName: string): Promise<void>;
    createAggBasedVisualization(subType: string, dataSource: string): Promise<void>;
    createVegaVisualization(): Promise<void>;
    createMapVisualization(): Promise<void>;
    createTSVBVisualization(): Promise<void>;
    clickEditInLensButton(): Promise<void>;
    getEditInLensButton(): import("playwright-core").Locator;
}
export {};
