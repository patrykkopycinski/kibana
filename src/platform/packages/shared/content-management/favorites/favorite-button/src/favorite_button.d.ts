import React from 'react';
import type { FavoriteButtonStatus } from './favorite_status';
export interface FavoriteButtonProps {
    status: FavoriteButtonStatus;
    onClick: () => void;
    addLabel: string;
    removeLabel: string;
    isDisabled?: boolean;
    className?: string;
    'data-test-subj'?: string;
}
export declare const FavoriteButton: ({ status, onClick, addLabel, removeLabel, isDisabled, className, 'data-test-subj': dataTestSubj, }: FavoriteButtonProps) => React.JSX.Element;
