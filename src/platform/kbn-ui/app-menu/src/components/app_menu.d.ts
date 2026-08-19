import React from 'react';
import type { AppMenuConfig, AppMenuStaticItem } from '../types';
import { type AppMenuBreakpointSource } from './app_menu_responsive';
export type { AppMenuBreakpointSource };
export interface AppMenuItemsProps {
    config?: AppMenuConfig;
    visible?: boolean;
    breakpointSource?: AppMenuBreakpointSource;
    /**
     * Static items that always appear at the end of the overflow menu.
     */
    staticItems?: AppMenuStaticItem[];
}
export declare const AppMenuComponent: ({ config, visible, breakpointSource, staticItems, }: AppMenuItemsProps) => React.JSX.Element | null;
