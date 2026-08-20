import type { ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react';
export interface FooterIds {
    footerNavigationInstructionsId: string;
}
export type FooterChildren = ReactNode | ((ids: FooterIds) => ReactNode);
export interface FooterProps {
    children: FooterChildren;
    isCollapsed: boolean;
    collapseButton?: ReactNode;
}
export declare const Footer: ForwardRefExoticComponent<FooterProps & RefAttributes<HTMLElement>> & {
    Item: ForwardRefExoticComponent<import("./item").FooterItemProps & RefAttributes<HTMLAnchorElement>>;
};
