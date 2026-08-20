import type { FC, ReactNode } from 'react';
import type { Footer } from '../footer';
import type { Logo } from './logo';
import type { NestedSecondaryMenu } from '../nested_secondary_menu';
import type { Popover } from './popover';
import type { PrimaryMenu } from '../primary_menu';
import type { SecondaryMenu } from '../secondary_menu';
import type { SidePanel } from './side_panel';
export interface SideNavProps {
    children: ReactNode;
    isCollapsed: boolean;
}
interface SideNavComponent extends FC<SideNavProps> {
    Logo: typeof Logo;
    PrimaryMenu: typeof PrimaryMenu;
    Popover: typeof Popover;
    SecondaryMenu: typeof SecondaryMenu;
    NestedSecondaryMenu: typeof NestedSecondaryMenu;
    Footer: typeof Footer;
    SidePanel: typeof SidePanel;
}
/**
 * A wrapper component for the side navigation that encapsulates:
 * - the logo,
 * - the primary menu,
 * - the secondary menu used in the popover and in the side panel,
 * - the nested secondary menu used in the "More" menu,
 * - the footer,
 * - the side panel.
 */
export declare const SideNav: SideNavComponent;
export {};
