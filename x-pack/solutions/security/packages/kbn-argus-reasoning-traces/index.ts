/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export {
  ARGUS_TRACE_ATTR,
  type ArgusTraceAttrKey,
  type ArgusTraceAttrName,
  type ArgusDecisionKind,
  type ArgusTrustTier,
  type ArgusAttrValue,
  type ArgusSpanAttributes,
} from './trace_attributes';

export {
  describeArgusOtlpExporter,
  type ArgusOtlpExporterConfig,
  type ArgusOtlpExporterDescriptor,
} from './otlp_exporter';
