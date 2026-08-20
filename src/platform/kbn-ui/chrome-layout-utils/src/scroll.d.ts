/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export type ScrollContainer = HTMLElement;
export declare const getScrollContainer: () => ScrollContainer;
export declare const getViewportHeight: (container?: ScrollContainer) => number;
export declare const getViewportBoundaries: (container?: ScrollContainer) => {
  top: number;
  bottom: number;
};
export declare const getScrollPosition: (container?: ScrollContainer) => number;
export declare const scrollTo: (
  opts: {
    top: number;
    behavior?: ScrollBehavior;
  },
  container?: ScrollContainer
) => void;
export declare const scrollToTop: (
  opts?: {
    behavior?: ScrollBehavior;
  },
  container?: ScrollContainer
) => void;
export declare const scrollToBottom: (
  opts?: {
    behavior?: ScrollBehavior;
  },
  container?: ScrollContainer
) => void;
export declare const getScrollDimensions: (container?: ScrollContainer) => {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};
export declare const scrollBy: (
  opts: {
    top: number;
    behavior?: ScrollBehavior;
  },
  container?: ScrollContainer
) => void;
export declare const isAtBottomOfPage: (container?: ScrollContainer) => boolean;
