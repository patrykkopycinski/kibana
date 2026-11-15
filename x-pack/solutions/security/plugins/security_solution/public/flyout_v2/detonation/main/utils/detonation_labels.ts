/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  DetonateConfidence,
  DetonateVerdictName,
} from '../../../../../common/detonate_prototype';
import * as i18n from '../../../../detonate_prototype/translations';

export const CONFIDENCE_LABEL: Record<DetonateConfidence, string> = {
  high: i18n.META_CONFIDENCE_HIGH,
  medium: i18n.META_CONFIDENCE_MEDIUM,
  low: i18n.META_CONFIDENCE_LOW,
};

export const VERDICT_LABEL: Record<DetonateVerdictName, string> = {
  malicious: i18n.VERDICT_MALICIOUS,
  benign: i18n.VERDICT_BENIGN,
  inconclusive: i18n.VERDICT_INCONCLUSIVE,
};
