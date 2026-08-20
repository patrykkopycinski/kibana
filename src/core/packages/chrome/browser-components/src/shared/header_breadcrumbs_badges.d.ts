/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ReactElement } from 'react';
import type React from 'react';
import type { EuiBadgeProps, EuiToolTipProps } from '@elastic/eui';
export type HeaderBreadcrumbsBadgeProps = EuiBadgeProps & {
  badgeText: string;
  toolTipProps?: Partial<EuiToolTipProps>;
  renderCustomBadge?: (props: { badgeText: string }) => ReactElement;
};
export declare const HeaderBreadcrumbsBadges: ({
  badges,
  isFirst,
}: {
  badges: HeaderBreadcrumbsBadgeProps[] | undefined;
  isFirst: boolean;
}) => React.JSX.Element | null;
