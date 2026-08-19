import React from 'react';
import type { AppHeaderFavoriteAction, AppHeaderShareAction } from '../types';
export interface TitleActionsProps {
    shareAction?: AppHeaderShareAction;
    favorite?: AppHeaderFavoriteAction;
}
export declare const TitleActions: React.NamedExoticComponent<TitleActionsProps>;
