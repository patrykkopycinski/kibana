/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Capabilities } from '@kbn/core-capabilities-common';
import type { IBasePath } from '@kbn/core-http-browser';
import type { MountPoint } from '@kbn/core-mount-utils-browser';
export declare function useBasePath(): IBasePath;
export declare function useCapabilities(): Capabilities;
/**
 * True when the current user can access the Integrations app.
 * Same signal used by Home and NoDataCard (`capabilities.navLinks.integrations`).
 */
export declare function useCanAccessIntegrations(): boolean;
export declare function useLegacyActionMenu(): MountPoint | undefined;
export declare function useHasLegacyActionMenu(): boolean;
