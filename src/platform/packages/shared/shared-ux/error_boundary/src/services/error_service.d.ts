/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type React from 'react';
interface ErrorServiceError {
  error: Error;
  errorInfo?: React.ErrorInfo;
  name: string | null;
  isFatal: boolean;
}
/**
 * Kibana Error Boundary Services: Error Service
 * Each Error Boundary tracks an instance of this class
 * @internal
 */
export declare class KibanaErrorService {
  /**
   * Determines if the error fallback UI should appear as an apologetic but promising "Refresh" button,
   * or treated with "danger" coloring and include a detailed error message.
   */
  private getIsFatal;
  /**
   * Derive the name of the component that threw the error
   */
  private getErrorComponentName;
  /**
   * Classifies a caught error for the fallback UI (fatal vs recoverable, component name).
   * Error content is reported to APM RUM by the error boundary, not via EBT.
   */
  enqueueError(error: Error, errorInfo?: React.ErrorInfo): ErrorServiceError;
}
export {};
