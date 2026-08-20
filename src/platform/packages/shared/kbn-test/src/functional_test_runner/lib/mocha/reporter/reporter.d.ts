/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export declare function MochaReporterProvider({ getService }: { getService: any }): new (
  runner: any,
  options: any
) => {
  onStart: () => void;
  onHookStart: (hook: any) => void;
  onHookEnd: () => void;
  onSuiteStart: (suite: any) => void;
  onSuiteEnd: () => void;
  onTestStart: (test: any) => void;
  onTestEnd: (test: any) => void;
  onPending: (test: any) => void;
  onPass: (test: any) => void;
  onFail: (runnable: any) => void;
  onEnd: () => void;
};
