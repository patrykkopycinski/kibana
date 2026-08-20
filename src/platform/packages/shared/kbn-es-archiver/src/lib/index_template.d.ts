/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Client } from '@elastic/elasticsearch';
export declare const getIndexTemplate: (
  client: Client,
  templateName: string
) => Promise<{
  index_patterns: import('@elastic/elasticsearch/lib/api/types').Names;
  version?: import('@elastic/elasticsearch/lib/api/types').VersionNumber;
  priority?: import('@elastic/elasticsearch/lib/api/types').long;
  _meta?: import('@elastic/elasticsearch/lib/api/types').Metadata;
  allow_auto_create?: boolean;
  data_stream?: import('@elastic/elasticsearch/lib/api/types').IndicesIndexTemplateDataStreamConfiguration;
  deprecated?: boolean;
  ignore_missing_component_templates?: import('@elastic/elasticsearch/lib/api/types').Names;
  created_date?: import('@elastic/elasticsearch/lib/api/types').DateTime;
  created_date_millis?: import('@elastic/elasticsearch/lib/api/types').EpochTime<
    import('@elastic/elasticsearch/lib/api/types').UnitMillis
  >;
  modified_date?: import('@elastic/elasticsearch/lib/api/types').DateTime;
  modified_date_millis?: import('@elastic/elasticsearch/lib/api/types').EpochTime<
    import('@elastic/elasticsearch/lib/api/types').UnitMillis
  >;
  name: string;
  template: any;
}>;
