/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SolutionId } from '@kbn/core-chrome-browser';
/**
 * Returns the ID of the currently active solution navigation, or `null` when
 * no solution nav is active (e.g. in classic nav mode).
 */
export declare function useActiveSolutionNavId(): SolutionId | null;
