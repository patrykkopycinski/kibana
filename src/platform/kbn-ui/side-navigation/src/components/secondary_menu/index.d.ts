import type { ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react';
import type { BadgeType } from '../../../types';
import { SecondaryMenuItemComponent } from './item';
import { SecondaryMenuSectionComponent } from './section';
export interface SecondaryMenuProps {
    badgeType?: BadgeType;
    children: ReactNode;
    isNew?: boolean;
    isPanel?: boolean;
    title: string;
}
/**
 * This menu is reused between the side nav panel and the side nav popover.
 */
export declare const SecondaryMenu: ForwardRefExoticComponent<SecondaryMenuProps & RefAttributes<HTMLDivElement>> & {
    Item: typeof SecondaryMenuItemComponent;
    Section: typeof SecondaryMenuSectionComponent;
};
