/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export declare const fleetPackageRegistryDockerImage: string;
/**
 * This is used by CI to set the docker registry port
 * you can also define this environment variable locally when running tests which
 * will spin up a local docker package registry locally for you
 * if this is defined it takes precedence over the `packageRegistryOverride` variable
 */
export declare const dockerRegistryPort: string | undefined;
export declare const packageRegistryDocker: {
  enabled: boolean;
  image: string;
  portInContainer: number;
  port: string | undefined;
  args: string[];
  waitForLogLine: string;
  waitForLogLineTimeoutMs: number;
  preferCached: boolean;
};
