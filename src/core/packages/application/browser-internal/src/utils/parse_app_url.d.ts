/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { IBasePath } from '@kbn/core-http-browser';
import type { App } from '@kbn/core-application-browser';
import type { ParsedAppUrl } from '../types';
/**
 * Parse given URL and return the associated app id and path if any app matches, or undefined if none do.
 * Input can either be:
 *
 * - an absolute path containing the basePath,
 *   e.g `/base-path/app/my-app/some-path`
 *
 * - an absolute URL matching the `origin` of the Kibana instance (as seen by the browser),
 *   e.g `https://kibana:8080/base-path/app/my-app/some-path`
 *
 * - a path relative to the provided `currentUrl`.
 *   e.g with `currentUrl` being `https://kibana:8080/base-path/app/current-app/some-path`
 *   `../other-app/other-path` will be converted to `/base-path/app/other-app/other-path`
 */
export declare const parseAppUrl: (
  url: string,
  basePath: IBasePath,
  apps: Map<string, App<unknown>>,
  currentUrl?: string
) => ParsedAppUrl | undefined;
