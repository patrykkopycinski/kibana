/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export declare enum EsqlSettingNames {
  APPROXIMATION = 'approximation',
  PROJECT_ROUTING = 'project_routing',
  TIME_ZONE = 'time_zone',
  UNMAPPED_FIELDS = 'unmapped_fields',
}
export declare const settings: {
  name: EsqlSettingNames;
  type: string[];
  serverlessOnly: boolean;
  preview: boolean;
  snapshotOnly: boolean;
  description: string;
  ignoreAsSuggestion: boolean;
}[];
