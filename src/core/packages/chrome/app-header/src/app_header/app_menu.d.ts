import React from 'react';
import { type AppMenuConfig } from '@kbn/app-menu';
export interface AppMenuProps {
    menu?: AppMenuConfig;
    docLink?: string;
    showAddIntegrations?: boolean;
}
export declare const AppMenu: React.NamedExoticComponent<AppMenuProps>;
