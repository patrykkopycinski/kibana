/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { RecursiveReadonly } from '@kbn/utility-types';
import type { InternalHttpStart } from '@kbn/core-http-browser-internal';
import type { Capabilities } from '@kbn/core-capabilities-common';
interface StartDeps {
  appIds: string[];
  http: InternalHttpStart;
}
/** @internal */
export interface CapabilitiesStart {
  capabilities: RecursiveReadonly<Capabilities>;
}
/**
 * Service that is responsible for UI Capabilities.
 * @internal
 */
export declare class CapabilitiesService {
  start({ appIds, http }: StartDeps): Promise<CapabilitiesStart>;
}
export {};
