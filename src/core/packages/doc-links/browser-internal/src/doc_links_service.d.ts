/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreContext } from '@kbn/core-base-browser-internal';
import type { InternalInjectedMetadataSetup } from '@kbn/core-injected-metadata-browser-internal';
import type { DocLinksStart } from '@kbn/core-doc-links-browser';
/** @internal */
export interface DocLinksServiceStartDeps {
  injectedMetadata: InternalInjectedMetadataSetup;
}
/** @internal */
export declare class DocLinksService {
  private readonly coreContext;
  constructor(coreContext: CoreContext);
  setup(): void;
  start({ injectedMetadata }: DocLinksServiceStartDeps): DocLinksStart;
}
