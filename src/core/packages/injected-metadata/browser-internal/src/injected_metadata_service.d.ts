/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  InjectedMetadataParams,
  InternalInjectedMetadataSetup,
  InternalInjectedMetadataStart,
} from './types';
/**
 * Provides access to the metadata that is injected by the
 * server into the page. The metadata is actually defined
 * in the entry file for the bundle containing the new platform
 * and is read from the DOM in most cases.
 *
 * @internal
 */
export declare class InjectedMetadataService {
  private readonly params;
  private state;
  constructor(params: InjectedMetadataParams);
  start(): InternalInjectedMetadataSetup;
  setup(): InternalInjectedMetadataStart;
}
