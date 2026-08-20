import React from 'react';
import { type IconType } from '@elastic/eui';
interface AppMenuItemLabelProps {
    label: string;
    description: string;
    isDisabled?: boolean;
    isLoading?: boolean;
    testId?: string;
    labelBadgeText?: string;
    iconType?: IconType;
}
export declare const AppMenuItemLabel: ({ label, description, isDisabled, isLoading, testId, labelBadgeText, iconType, }: AppMenuItemLabelProps) => React.JSX.Element;
export {};
