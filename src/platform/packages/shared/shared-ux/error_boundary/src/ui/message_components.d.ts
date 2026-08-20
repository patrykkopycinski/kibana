/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type React from 'react';
interface FatalPromptProps {
  showErrorDetails: () => void;
  onClickRefresh: () => void;
}
export declare const FatalPrompt: React.FC<
  ErrorDetailsProps & Omit<FatalPromptProps, 'showErrorDetails'>
>;
interface RecoverablePromptProps {
  onClickRefresh: () => void;
}
export declare const RecoverablePrompt: ({
  onClickRefresh,
}: RecoverablePromptProps) => React.JSX.Element;
interface SectionFatalPromptProps {
  sectionName: string;
  showErrorDetails: () => void;
}
export declare const SectionFatalPrompt: React.FC<
  ErrorDetailsProps & Omit<SectionFatalPromptProps, 'showErrorDetails'>
>;
interface SectionRecoverablePromptProps {
  sectionName: string;
  onClickRefresh: () => void;
}
export declare const SectionRecoverablePrompt: ({
  sectionName,
  onClickRefresh,
}: SectionRecoverablePromptProps) => JSX.Element;
interface ErrorDetailsProps {
  error: Error;
  errorInfo: Partial<React.ErrorInfo> | null;
  name: string | null;
}
export {};
