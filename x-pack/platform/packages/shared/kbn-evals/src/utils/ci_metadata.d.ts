/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BuildkiteMetadata } from '@kbn/evals-common';
export type BuildkiteCiMetadata = BuildkiteMetadata;
export declare function getBuildkiteCiMetadataFromEnv(): BuildkiteCiMetadata | undefined;
