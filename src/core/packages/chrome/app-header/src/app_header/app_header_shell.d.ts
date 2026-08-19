import type { ReactNode } from 'react';
import React from 'react';
import type { AppHeaderSpacing } from '../types';
export interface AppHeaderShellProps {
    title?: ReactNode;
    badges?: ReactNode;
    titleActions?: ReactNode;
    titleAppend?: ReactNode;
    trailing?: ReactNode;
    secondaryContent?: ReactNode;
    secondaryContentTestSubj?: string;
    tabs?: ReactNode;
    sticky?: boolean;
    spacing?: AppHeaderSpacing;
    borderless?: boolean;
}
export declare const AppHeaderShell: React.NamedExoticComponent<AppHeaderShellProps>;
