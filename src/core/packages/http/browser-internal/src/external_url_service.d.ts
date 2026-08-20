/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreService } from '@kbn/core-base-browser-internal';
import type { IExternalUrl } from '@kbn/core-http-browser';
import type { InternalInjectedMetadataSetup } from '@kbn/core-injected-metadata-browser-internal';
interface SetupDeps {
  location: Pick<Location, 'href'>;
  injectedMetadata: InternalInjectedMetadataSetup;
}
export declare class ExternalUrlService implements CoreService<IExternalUrl> {
  setup({ injectedMetadata, location }: SetupDeps): IExternalUrl;
  start(): void;
  stop(): void;
}
export {};
