import type { ScoutPage } from '..';
import type { KibanaCodeEditorWrapper } from '../ui_components';
interface ChartSwitchPopoverOptions {
    search?: string;
    visType?: string;
}
export declare class LensApp {
    protected readonly page: ScoutPage;
    readonly lensApp: import("playwright-core").Locator;
    readonly saveAndReturnButton: import("playwright-core").Locator;
    readonly saveButton: import("playwright-core").Locator;
    readonly saveModal: import("playwright-core").Locator;
    readonly savedObjectTitleInput: import("playwright-core").Locator;
    readonly confirmSaveButton: import("playwright-core").Locator;
    /**
     * Needed by the Lens plugin's `openDimensionEditor` / `secondaryFlyoutBackButton` alias
     * as well as `closeDimensionEditor` here.
     */
    protected readonly closeDimensionEditorButton: import("playwright-core").Locator;
    readonly applyFlyoutButton: import("playwright-core").Locator;
    readonly cancelFlyoutButton: import("playwright-core").Locator;
    protected readonly codeEditor: KibanaCodeEditorWrapper;
    private readonly chartSwitchPopover;
    private readonly chartSwitchList;
    /**
     * Formula Monaco textarea — Lens has no data-test-subj on the editor input.
     * Note: `lnsFormulaWidget` is the overflow/suggest portal on `document.body`, not the editor.
     */
    private readonly formulaEditorTextarea;
    constructor(page: ScoutPage);
    waitForLensApp(): Promise<void>;
    /**
     * Switches the active visualization via the chart switcher.
     *
     * @param visType Chart switcher test-subj suffix (e.g. `lnsMetric`, `bar`), not the display label.
     * @param options.search Optional filter text when the target chart is easier to find by label.
     */
    switchToVisualization(visType: string, options?: {
        search?: string;
    }): Promise<void>;
    /**
     * Opens the chart switcher popover, optionally filtering its list.
     * Prefer `switchToVisualization` to switch; open the popover directly only to assert on
     * its contents (e.g. the warning badge of a chart type), then close it or pick an option.
     *
     * @param options.visType Chart switcher test-subj suffix to wait for after filtering.
     * @param options.search Filter text, needed when the target chart is not rendered by the
     * virtualized list until it is filtered.
     */
    openChartSwitchPopover(options?: ChartSwitchPopoverOptions): Promise<void>;
    /** Locator for a chart type's row in the open chart switcher popover. */
    getChartSwitchOption(visType: string): import("playwright-core").Locator;
    /**
     * Locator for the badge warning that switching to this chart type would change the current
     * configuration. Resolves only while the popover is open and the option is rendered, so
     * assert the option itself is visible before asserting the badge is absent.
     */
    getChartSwitchWarning(visType: string): import("playwright-core").Locator;
    /** Picks a chart type from the open chart switcher popover. */
    selectChartSwitchOption(visType: string): Promise<void>;
    /** Returns the chart type label shown in the chart switcher popover. */
    getChartSwitchType(): Promise<string>;
    private filterChartSwitchOptions;
    /**
     * Clicks "Save and return" and waits for Lens to close and the dashboard
     * viewport to be visible.
     */
    saveAndReturn(): Promise<void>;
    /**
     * Opens the Lens save modal, fills in the title, optionally selects
     * a dashboard target, and confirms. Waits for the modal to close.
     */
    save(title: string, options?: {
        addToDashboard: 'existing';
        dashboardTitle: string;
    } | {
        addToDashboard: 'new';
    } | {
        addToDashboard: 'none';
    }): Promise<void>;
    applyFlyoutChanges(): Promise<void>;
    cancelFlyoutChanges(): Promise<void>;
    configureXYDimensions(options?: {
        y?: {
            operation: string;
            field?: string;
        };
        x?: {
            operation: string;
            field?: string;
        };
        split?: {
            operation: string;
            field?: string;
            palette?: {
                mode: 'legacy' | 'colorMapping';
                id: string;
            };
        };
    }): Promise<void>;
    configureDimension(opts: {
        dimension: string;
        operation: string;
        field?: string;
        formula?: string;
        isPreviousIncompatible?: boolean;
        palette?: {
            mode: 'legacy' | 'colorMapping';
            id: string;
        };
        disableEmptyRows?: boolean;
        keepOpen?: boolean;
    }): Promise<void>;
    private openDimensionSelector;
    switchToFormula(): Promise<void>;
    selectOperation(operation: string, isPreviousIncompatible?: boolean): Promise<void>;
    private selectField;
    /**
     * Types into the formula Monaco editor.
     * Use `replace: true` to clear first (dimension configure). Omit replace to append
     * (autocomplete paths). Lens auto-inserts quotes/parens after some tokens (e.g. `kql=`),
     * so callers should `expect.poll(() => lens.getFormulaText())` for the final value.
     */
    typeInFormula(text: string, options?: {
        replace?: boolean;
        focus?: boolean;
    }): Promise<void>;
    /**
     * Focuses the formula Monaco textarea (avoid `{ force: true }` — suggest portals intercept clicks).
     */
    private focusFormulaEditor;
    /**
     * Lens formula uses the last registered Monaco model (not always index 0).
     * Needed by the Lens plugin's `getFormulaText` as well as `typeInFormula` here.
     */
    protected getFormulaModelIndex(): Promise<number>;
    setEuiSwitch(testSubj: string, checked: boolean): Promise<void>;
    /**
     * Closes the open dimension editor flyout.
     * Caller must have the dimension editor open.
     */
    closeDimensionEditor(): Promise<void>;
    /** Opens the palette panel flyout for the currently active dimension. */
    openPalettePanelFlyout(): Promise<void>;
    closePalettePanelFlyout(): Promise<void>;
    private setPalette;
    /**
     * Maps a caller-facing field id to its internal field-list `data-attr-field`/test-subj suffix.
     * Needed by the Lens plugin's other drag-and-drop helpers as well as `dragFieldToWorkspace` here.
     */
    protected getFieldAttrName(field: string): string;
    protected getFieldListPanelFieldLocator(field: string): import("playwright-core").Locator;
    /**
     * Drags a field onto the Lens workspace (FTR `dragFieldToWorkspace`).
     * Uses HTML5 DnD — Playwright `dragTo` does not reliably drive Lens drop zones.
     */
    dragFieldToWorkspace(field: string, visualizationTestSubj?: string): Promise<void>;
    protected waitForLensDragDropToFinish(): Promise<void>;
    /**
     * HTML5 DnD between test-subj chains (FTR `browser.html5DragAndDrop`).
     * Chains use `>` separators (e.g. `panel > lns-dimensionTrigger`).
     *
     * Dispatches the same event sequence a browser does — dragstart, dragenter, dragover, drop,
     * dragend — and waits for the target to report each state via `@kbn/dom-drag-drop` classes.
     * Both waits matter: drop targets register with the drag-drop context only after the drag
     * starts (`domDroppable--active`), and Lens resolves a drop against the target the last
     * dragover selected (`domDroppable--hover`). Dropping without those lands a partial change,
     * for example moving a dimension between groups removes it from the source group and never
     * adds it to the target one.
     *
     * Needed by the Lens plugin's other drag-and-drop helpers as well as `dragFieldToWorkspace` here.
     */
    protected html5DragAndDrop(from: string, to: string): Promise<void>;
    /**
     * Waits for the Lens visualization workspace to finish rendering.
     * Polls the render count until it stabilises across two consecutive reads (500 ms apart),
     * reading `data-rendering-count` from the embeddable container where it exists (dashboards)
     * and falling back to the Elastic Charts render count, which is all the Lens editor renders.
     *
     * When `options.afterCount` is set, also requires at least one newer completed render than
     * that baseline before settling — use this after an edit that must land in a subsequent
     * chart pass (e.g. reference-line style) so a settle on the pre-edit count can't win the race.
     */
    waitForVisualization(chartSubj?: string, options?: {
        afterCount?: number;
    }): Promise<void>;
}
export {};
