/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Observable } from 'rxjs';
import type { EuiContextMenuPanelItemDescriptor } from '@elastic/eui';
import type { HelpLinks } from './help_menu_links';
/**
 * Returns an observable of pre-built help menu link groups for the given chrome style.
 * Used by both `HeaderHelpMenu` (via `useObservable`) and the project sidenav (via `combineLatest`).
 */
export declare function useHelpLinks$(): Observable<HelpLinks>;
export declare const useHelpMenuItems: ({
  closeMenu,
}: {
  closeMenu: () => void;
}) => EuiContextMenuPanelItemDescriptor[];
