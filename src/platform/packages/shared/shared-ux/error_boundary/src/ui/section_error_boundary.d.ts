/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type React from 'react';
interface SectionErrorBoundaryProps {
  sectionName: string;
  /** How many times to retry remounting before showing error (default: 0, no retries) */
  maxRetries?: number;
}
/**
 * `KibanaSectionErrorBoundary` is designed to capture errors at a granular level.
 *
 * In general, it's best to use `KibanaErrorBoundary` and block the whole page.
 * Users will see an error state on the page and think that there are instabilities in the system.
 * They will be / should be wary about making any changes in a UI showing an error, since it risks
 * further instability.
 *
 * If it is acceptable to assume the risk of allowing users to interact with a UI that
 * has an error state, then using `KibanaSectionErrorBoundary` may be an acceptable alternative,
 * but this must be judged on a case-by-case basis.
 *
 * @example
 * ```tsx
 * <KibanaSectionErrorBoundary sectionName="Dashboard" maxRetries={3}>
 *   <MySection />
 * </KibanaSectionErrorBoundary>
 * ```
 */
export declare const KibanaSectionErrorBoundary: (
  props: React.PropsWithChildren<SectionErrorBoundaryProps>
) => React.JSX.Element;
export {};
