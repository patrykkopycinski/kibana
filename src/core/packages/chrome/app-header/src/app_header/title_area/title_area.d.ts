import type { ReactNode } from 'react';
import React from 'react';
import type { AppHeaderBack, AppHeaderEditableTitle } from '../../types';
export interface TitleAreaProps {
    title?: string | AppHeaderEditableTitle;
    back?: AppHeaderBack | AppHeaderBack[];
    size?: 'xs' | 's';
    /**
     * Rendered in the title slot when no title is provided, so loading placeholders
     * share the same gap and offset as a real title.
     */
    placeholder?: ReactNode;
}
export declare const TitleArea: React.NamedExoticComponent<TitleAreaProps>;
