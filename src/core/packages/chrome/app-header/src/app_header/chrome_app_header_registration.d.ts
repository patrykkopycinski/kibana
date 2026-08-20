/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type React from 'react';
import type { ChromeAppHeaderConfig } from '@kbn/core-chrome-browser';
/**
 * Low-level registration hook for wrappers that need Chrome-owned header placement.
 * Prefer rendering `AppHeader` directly. New uses should be reviewed by `@elastic/appex-sharedux`.
 */
export declare const useChromeAppHeaderRegistration: (config: ChromeAppHeaderConfig) => void;
/**
 * Registers header configuration for Chrome-owned top-bar placement.
 * Prefer rendering `AppHeader` directly. Use this only when sticky or shared top navigation, or
 * other layout constraints, require Chrome to own the header slot. New uses should be reviewed by
 * `@elastic/appex-sharedux`.
 */
export declare const ChromeAppHeaderRegistration: React.NamedExoticComponent<ChromeAppHeaderConfig>;
