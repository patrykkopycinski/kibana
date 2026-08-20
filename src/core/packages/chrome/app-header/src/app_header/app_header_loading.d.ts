import React from 'react';
import type { AppHeaderBack, AppHeaderSpacing } from '../types';
/**
 * Optional menu-skeleton customization. Omit the whole `menu` prop to get the default
 * overflow + primary placeholders.
 */
export interface AppHeaderLoadingMenu {
    /**
     * App menu button placeholders on the left (overflow / secondary actions).
     * Defaults to 1. Clamped to `APP_MENU_ITEM_LIMIT` (3) from `@kbn/app-menu` —
     * the max visible left-side slots. The primary action does not count toward this.
     */
    buttonCount?: number;
    /** Primary-action app menu button. Defaults to `true`. */
    hasPrimary?: boolean;
}
export interface AppHeaderLoadingProps {
    back?: AppHeaderBack | AppHeaderBack[];
    menu?: AppHeaderLoadingMenu;
    /**
     * Defaults to `true`. Set to `false` only when the surrounding full-page layout
     * provides its own sticky-header mechanism for the correct scrolling container.
     */
    sticky?: boolean;
    /**
     * Controls the horizontal inset. Defaults to `standard` so the skeleton matches a
     * typical title + app menu header.
     */
    spacing?: AppHeaderSpacing;
}
/**
 * Loading-state header view without claiming the inline slot. Prefer {@link AppHeaderLoading}.
 */
export declare const AppHeaderLoadingView: React.NamedExoticComponent<AppHeaderLoadingProps>;
/**
 * Loading placeholder for {@link AppHeader}. Mounts in the same inline slot and skeletons the
 * title and app menu with defaults that match a typical title + overflow + primary header.
 */
export declare const AppHeaderLoading: React.NamedExoticComponent<AppHeaderLoadingProps>;
