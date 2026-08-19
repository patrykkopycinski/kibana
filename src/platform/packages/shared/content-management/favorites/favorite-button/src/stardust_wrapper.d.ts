import type { PropsWithChildren } from 'react';
import React from 'react';
/** Longest stardust CSS animation (`sparkles-*`); keep class until it can finish. */
export declare const STARDUST_ANIMATION_MS = 650;
export declare const StardustWrapper: ({ active, className, children, }: PropsWithChildren<{
    className?: string;
    active: boolean;
}>) => React.JSX.Element;
