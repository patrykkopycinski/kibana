import React from 'react';
import { type EuiBreakpointSize } from '@elastic/eui';
export type AppMenuBreakpointSource = 'application' | 'viewport';
export type AppMenuLayout = 'collapsed' | 'minimal' | 'expanded';
export declare const APPLICATION_LAYOUTS: Record<EuiBreakpointSize, AppMenuLayout>;
export declare const VIEWPORT_LAYOUTS: Record<EuiBreakpointSize, AppMenuLayout>;
export declare const AppMenuHeaderLinks: ({ children }: {
    children: React.ReactNode;
}) => React.JSX.Element;
export interface AppMenuResponsiveContentProps {
    content: Record<AppMenuLayout, React.ReactNode>;
}
type AppMenuResolvedResponsiveContentProps = AppMenuResponsiveContentProps & {
    breakpoint: EuiBreakpointSize | undefined;
    source: AppMenuBreakpointSource;
};
export declare const AppMenuResponsiveContent: ({ content, breakpoint, source, }: AppMenuResolvedResponsiveContentProps) => React.JSX.Element;
export declare const AppMenuApplicationResponsiveContent: (props: AppMenuResponsiveContentProps) => React.JSX.Element;
export declare const AppMenuViewportResponsiveContent: (props: AppMenuResponsiveContentProps) => React.JSX.Element;
export {};
