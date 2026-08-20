import type { ReactNode, FC } from 'react';
import type { Header } from './header';
import type { Item } from './menu_item';
import type { Panel } from './menu_panel';
import type { PrimaryMenuItem } from './primary_menu_item';
import type { SecondaryMenu } from '../secondary_menu';
interface NestedSecondaryMenuProps {
    children: ReactNode;
    initialPanel?: string;
}
interface NestedSecondaryMenuComponent extends FC<NestedSecondaryMenuProps> {
    Header: typeof Header;
    Item: typeof Item;
    Panel: typeof Panel;
    PrimaryMenuItem: typeof PrimaryMenuItem;
    Section: typeof SecondaryMenu.Section;
}
export declare const NestedSecondaryMenu: NestedSecondaryMenuComponent;
export {};
