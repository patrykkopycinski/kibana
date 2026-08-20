/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Buildkite info
 */
export interface BuildkiteMetadata {
  branch?: string;
  commit?: string;
  job_id?: string;
  retry_count?: number;
  message?: string;
  build: {
    id?: string;
    number?: string;
    url?: string;
  };
  pipeline: {
    id?: string;
    name?: string;
    slug?: string;
  };
  agent: {
    name?: string;
  };
  group: {
    id?: string;
    key?: string;
    label?: string;
  };
  step: {
    id?: string;
    key?: string;
    label?: string;
  };
  command?: string;
  triggered_from_build: {
    id?: string;
    number?: string;
    pipeline_slug?: string;
  };
}
/**
 * Buildkite information extracted from environment variables
 *
 * This object is empty if the process is not running in a Buildkite pipeline.
 */
export declare const buildkite: BuildkiteMetadata;
