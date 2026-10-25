/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const DETONATE_PROTOTYPE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.navigation.title',
  { defaultMessage: 'Detonate' }
);

export const DETONATE_PROTOTYPE_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detonatePrototype.navigation.description',
  {
    defaultMessage:
      'Submit a sample to a sandbox and review the endpoint and detection alerts it produced.',
  }
);

export const SUBMIT_PANEL_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.submit.title',
  { defaultMessage: 'Submit a sample' }
);

export const SAMPLE_HASH_LABEL = i18n.translate(
  'xpack.securitySolution.detonatePrototype.submit.sampleHashLabel',
  { defaultMessage: 'Sample hash' }
);

export const SAMPLE_HASH_HELP = i18n.translate(
  'xpack.securitySolution.detonatePrototype.submit.sampleHashHelp',
  { defaultMessage: 'MD5, SHA-1 or SHA-256. The service fetches the sample by hash.' }
);

export const SAMPLE_FILE_LABEL = i18n.translate(
  'xpack.securitySolution.detonatePrototype.submit.sampleFileLabel',
  { defaultMessage: 'Sample file' }
);

export const SAMPLE_FILE_PROMPT = i18n.translate(
  'xpack.securitySolution.detonatePrototype.submit.sampleFilePrompt',
  { defaultMessage: 'Select or drag and drop a sample' }
);

export const TAGS_LABEL = i18n.translate(
  'xpack.securitySolution.detonatePrototype.submit.tagsLabel',
  { defaultMessage: 'Tags' }
);

export const TAGS_HELP = i18n.translate(
  'xpack.securitySolution.detonatePrototype.submit.tagsHelp',
  { defaultMessage: 'Optional. Used to find this run again later.' }
);

export const OS_FAMILY_LABEL = i18n.translate(
  'xpack.securitySolution.detonatePrototype.submit.osFamilyLabel',
  { defaultMessage: 'Operating system' }
);

export const ARCHITECTURE_LABEL = i18n.translate(
  'xpack.securitySolution.detonatePrototype.submit.architectureLabel',
  { defaultMessage: 'Architecture' }
);

export const SERVICE_DEFAULT = i18n.translate(
  'xpack.securitySolution.detonatePrototype.submit.serviceDefault',
  { defaultMessage: 'Service default' }
);

export const SUBMIT_BY_HASH = i18n.translate(
  'xpack.securitySolution.detonatePrototype.submit.byHash',
  { defaultMessage: 'By hash' }
);

export const SUBMIT_BY_FILE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.submit.byFile',
  { defaultMessage: 'By file' }
);

export const DETONATE_BUTTON = i18n.translate(
  'xpack.securitySolution.detonatePrototype.submit.button',
  { defaultMessage: 'Detonate' }
);

export const RUNS_TITLE = i18n.translate('xpack.securitySolution.detonatePrototype.runs.title', {
  defaultMessage: 'Detonations',
});

export const RUNS_SEARCH_PLACEHOLDER = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.searchPlaceholder',
  { defaultMessage: 'Search by hash, filename or tag' }
);

export const RUNS_EMPTY = i18n.translate('xpack.securitySolution.detonatePrototype.runs.empty', {
  defaultMessage: 'No detonations yet. Submit a sample to start one.',
});

export const COLUMN_SAMPLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.columnSample',
  { defaultMessage: 'Sample' }
);

export const COLUMN_SUBMITTED = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.columnSubmitted',
  { defaultMessage: 'Submitted' }
);

export const COLUMN_PROGRESS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.columnProgress',
  { defaultMessage: 'Progress' }
);

export const COLUMN_ALERTS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.columnAlerts',
  { defaultMessage: 'Alerts' }
);

export const COLUMN_TAGS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.columnTags',
  { defaultMessage: 'Tags' }
);

export const BACK_TO_RUNS = i18n.translate('xpack.securitySolution.detonatePrototype.detail.back', {
  defaultMessage: 'Back to detonations',
});

export const STATUS_RUNNING = i18n.translate(
  'xpack.securitySolution.detonatePrototype.status.running',
  { defaultMessage: 'Running' }
);

export const STATUS_COMPLETE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.status.complete',
  { defaultMessage: 'Complete' }
);

export const STATUS_FAILED = i18n.translate(
  'xpack.securitySolution.detonatePrototype.status.failed',
  { defaultMessage: 'Failed' }
);

export const TIMELINE_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.detail.timelineTitle',
  { defaultMessage: 'Detonation progress' }
);

export const PRODUCTION_ENDPOINT_ALERTS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.detail.productionEndpointAlerts',
  { defaultMessage: 'Endpoint alerts' }
);

export const DIAGNOSTIC_ENDPOINT_ALERTS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.detail.diagnosticEndpointAlerts',
  { defaultMessage: 'Diagnostic endpoint alerts' }
);

export const PRODUCTION_DETECTION_ALERTS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.detail.productionDetectionAlerts',
  { defaultMessage: 'Detection alerts' }
);

export const NO_ALERTS_IN_GROUP = i18n.translate(
  'xpack.securitySolution.detonatePrototype.detail.noAlertsInGroup',
  { defaultMessage: 'None' }
);

export const DETONATION_NOT_FOUND = i18n.translate(
  'xpack.securitySolution.detonatePrototype.detail.notFound',
  { defaultMessage: 'Detonation not found' }
);

export const QUIET_RUN_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.detail.quietRunTitle',
  { defaultMessage: 'This detonation produced no alerts' }
);

export const QUIET_RUN_BODY = i18n.translate(
  'xpack.securitySolution.detonatePrototype.detail.quietRunBody',
  {
    defaultMessage:
      'The run completed successfully. A sample can be benign, or this can be a detection gap worth investigating — it is not an error.',
  }
);

export const SERVICE_UNAVAILABLE_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.serviceUnavailableTitle',
  { defaultMessage: 'The detonation service is not reachable' }
);

export const DETONATE_FILE_ACTION = i18n.translate(
  'xpack.securitySolution.detonatePrototype.alertAction.detonateFile',
  { defaultMessage: 'Detonate file' }
);
