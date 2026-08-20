/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FC, ReactNode } from 'react';
export interface PanelIds {
  panelNavigationInstructionsId: string;
  panelEnterSubmenuInstructionsId: string;
}
export type PanelChildren = ReactNode | ((ids: PanelIds) => ReactNode);
export interface PanelProps {
  children: PanelChildren;
  id: string;
  title?: string;
}
export declare const Panel: FC<PanelProps>;
