import React from 'react';
import { type UseEuiTheme } from '@elastic/eui';
import type { LayoutAppearance } from '../layout.types';
export declare const globalLayoutStyles: () => import("@emotion/utils").SerializedStyles;
/**
 * Framed appearance background styles with gradient.
 * Only applied when appearance is 'framed'.
 */
export declare const framedAppearanceBackgroundStyles: (euiThemeContext: UseEuiTheme) => import("@emotion/utils").SerializedStyles;
export interface GridLayoutGlobalStylesProps {
    appearance?: LayoutAppearance;
}
export declare const GridLayoutGlobalStyles: ({ appearance }: GridLayoutGlobalStylesProps) => React.JSX.Element;
