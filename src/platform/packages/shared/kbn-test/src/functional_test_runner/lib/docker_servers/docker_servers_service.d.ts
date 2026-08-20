/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type * as Rx from 'rxjs';
import type { ToolingLog } from '@kbn/tooling-log';
import type { DockerServer, DockerServerSpec } from '@kbn/test-docker-servers';
import type { Lifecycle } from '../lifecycle';
export declare class DockerServersService {
  private log;
  private lifecycle;
  private disabled?;
  private servers;
  constructor(
    configs: {
      [name: string]: DockerServerSpec;
    },
    log: ToolingLog,
    lifecycle: Lifecycle,
    disabled?: boolean | undefined
  );
  isEnabled(name: string): boolean;
  has(name: string): boolean;
  get(name: string): {
    enabled: boolean;
    portInContainer: number;
    port: number;
    image: string;
    preferCached?: boolean;
    waitForLogLine?: RegExp | string;
    waitForLogLineTimeoutMs?: number;
    waitFor?: (server: DockerServer, logLine$: Rx.Observable<string>) => Rx.Observable<unknown>;
    args?: string[];
    name: string;
    url: string;
  };
  private dockerRun;
  private startServer;
  private isImageAvailableLocally;
  private startServers;
}
