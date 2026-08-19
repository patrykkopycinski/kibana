import type { ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react';
export interface PrimaryMenuIds {
    mainNavigationInstructionsId: string;
}
export type PrimaryMenuChildren = ReactNode | ((ids: PrimaryMenuIds) => ReactNode);
export interface PrimaryMenuProps {
    children: PrimaryMenuChildren;
    isCollapsed: boolean;
}
export declare const PrimaryMenuBase: ForwardRefExoticComponent<PrimaryMenuProps & RefAttributes<HTMLElement>>;
export declare const PrimaryMenu: ForwardRefExoticComponent<PrimaryMenuProps & RefAttributes<HTMLElement>> & {
    Item: ForwardRefExoticComponent<import("./item").PrimaryMenuItemProps & RefAttributes<HTMLAnchorElement | HTMLButtonElement>>;
};
