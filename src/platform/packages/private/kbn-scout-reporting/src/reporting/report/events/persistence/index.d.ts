/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { Client as ESClient } from '@elastic/elasticsearch';
import type { ScoutReportEvent } from '../event';
export declare class ScoutReportDataStream {
  private es;
  private log;
  constructor(es: ESClient, log?: ToolingLog);
  exists(): Promise<boolean>;
  initialize(): Promise<void>;
  setupComponentTemplates(): Promise<void>;
  setupIndexTemplate(): Promise<void>;
  addEvent(event: ScoutReportEvent): Promise<void>;
  addEventsFromFile(...eventLogPaths: string[]): Promise<void>;
}
