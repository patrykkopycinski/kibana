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

export const SERVICE_DEFAULT = i18n.translate(
  'xpack.securitySolution.detonatePrototype.submit.serviceDefault',
  { defaultMessage: 'Service default' }
);

export const EXEC_WAIT_LABEL = i18n.translate(
  'xpack.securitySolution.detonatePrototype.submit.execWaitLabel',
  { defaultMessage: 'Execution wait (seconds)' }
);

export const EXEC_WAIT_HELP = (max: number) =>
  i18n.translate('xpack.securitySolution.detonatePrototype.submit.execWaitHelp', {
    defaultMessage: 'Optional. How long the sample runs before the VM is collected, up to {max}.',
    values: { max },
  });

export const EXEC_WAIT_INVALID = (max: number) =>
  i18n.translate('xpack.securitySolution.detonatePrototype.submit.execWaitInvalid', {
    defaultMessage: 'Enter a whole number of seconds from 0 to {max}.',
    values: { max },
  });

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
  { defaultMessage: 'Search by hash, filename, tag or submitter' }
);

export const RUNS_EMPTY = i18n.translate('xpack.securitySolution.detonatePrototype.runs.empty', {
  defaultMessage: 'No detonations yet. Submit a sample to start one.',
});

export const RUNS_NO_MATCH = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.noMatch',
  { defaultMessage: 'No detonations match these filters' }
);

export const RUNS_CLEAR_FILTERS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.clearFilters',
  { defaultMessage: 'Clear filters' }
);

export const RUNS_ERROR_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.errorTitle',
  { defaultMessage: 'Could not load detonations' }
);

export const RUNS_TABLE_LOADING = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.tableLoading',
  { defaultMessage: 'Loading the Detonations table' }
);

export const RUNS_DATA_VIEW_ERROR = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.dataViewError',
  { defaultMessage: 'Could not set up the Detonations table' }
);

export const COLUMN_SAMPLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.columnSample',
  { defaultMessage: 'Sample' }
);

export const COLUMN_SUBMITTED = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.columnSubmitted',
  { defaultMessage: 'Submitted' }
);

export const COLUMN_STATUS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.columnStatus',
  { defaultMessage: 'Status' }
);

export const COLUMN_OS = i18n.translate('xpack.securitySolution.detonatePrototype.runs.columnOs', {
  defaultMessage: 'OS',
});

export const COLUMN_SOURCE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.columnSource',
  { defaultMessage: 'Source' }
);

export const RUNS_PRESETS_LABEL = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.presetsLabel',
  { defaultMessage: 'Quick filters' }
);

export const RUNS_PRESET_ALL = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.presetAll',
  { defaultMessage: 'All' }
);

export const RUNS_PRESET_IN_PROGRESS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.presetInProgress',
  { defaultMessage: 'In progress' }
);

export const RUNS_PRESET_MALICIOUS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.presetMalicious',
  { defaultMessage: 'Malicious' }
);

export const RUNS_PRESET_NEEDS_ATTENTION = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.presetNeedsAttention',
  { defaultMessage: 'Needs attention' }
);

export const RUNS_COPY_HASH = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.copyHash',
  { defaultMessage: 'Copy SHA-256' }
);

export const COLUMN_VERDICT = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.columnVerdict',
  { defaultMessage: 'Verdict' }
);

export const COLUMN_ALERTS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.columnAlerts',
  { defaultMessage: 'Alerts' }
);

export const COLUMN_TAGS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.columnTags',
  { defaultMessage: 'Tags' }
);

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

export const STATUS_QUEUED = i18n.translate(
  'xpack.securitySolution.detonatePrototype.status.queued',
  { defaultMessage: 'Queued' }
);

export const STATUS_QUEUED_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detonatePrototype.status.queuedDescription',
  { defaultMessage: 'A Worker picked this alert for detonation. The run has not started yet.' }
);

export const STATUS_NOT_ANALYZED = i18n.translate(
  'xpack.securitySolution.detonatePrototype.status.notAnalyzed',
  { defaultMessage: 'Not analyzed' }
);

export const STATUS_ALLOWANCE_REACHED = i18n.translate(
  'xpack.securitySolution.detonatePrototype.status.allowanceReached',
  { defaultMessage: 'Allowance reached' }
);

export const STATUS_ALLOWANCE_REACHED_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detonatePrototype.status.allowanceReachedDescription',
  { defaultMessage: 'Submitting is disabled until the monthly allowance resets.' }
);

export const STATUS_UNSUPPORTED_OS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.status.unsupportedOs',
  { defaultMessage: 'Unsupported OS' }
);

export const STATUS_UNSUPPORTED_OS_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detonatePrototype.status.unsupportedOsDescription',
  { defaultMessage: "The sandbox has no virtual machine for this host's operating system." }
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

export const GROUP_BODY_ERROR = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.groupBodyError',
  { defaultMessage: 'Could not load this detonation' }
);

export const BENIGN_RUN_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.detail.benignRunTitle',
  { defaultMessage: 'This detonation produced no alerts' }
);

export const BENIGN_RUN_BODY = i18n.translate(
  'xpack.securitySolution.detonatePrototype.detail.benignRunBody',
  {
    defaultMessage:
      'The run completed successfully and no malicious behavior was observed. That is not proof the sample is safe — it may be a detection gap worth investigating.',
  }
);

export const COVERAGE_GAP_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.detail.coverageGapTitle',
  { defaultMessage: 'Diagnostic-only behavior (potential coverage gap)' }
);

export const COVERAGE_GAP_BODY = i18n.translate(
  'xpack.securitySolution.detonatePrototype.detail.coverageGapBody',
  {
    defaultMessage:
      'The diagnostic run observed these behaviors that production policies did not alert on — a blocklist entry or detection rule may be suppressing or missing them.',
  }
);

export const RUN_HISTORY_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.detail.runHistoryTitle',
  { defaultMessage: 'Run history for this sample' }
);

export const RUN_HISTORY_EMPTY = i18n.translate(
  'xpack.securitySolution.detonatePrototype.detail.runHistoryEmpty',
  { defaultMessage: 'No other completed runs for this sample.' }
);

export const BEHAVIOR_DIFF_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.detail.behaviorDiffTitle',
  { defaultMessage: 'Behavior vs previous run' }
);

export const BEHAVIOR_DIFF_EMPTY = i18n.translate(
  'xpack.securitySolution.detonatePrototype.detail.behaviorDiffEmpty',
  {
    defaultMessage: 'First run of this sample — nothing to compare against yet.',
  }
);

export const BEHAVIOR_DIFF_NO_CHANGE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.detail.behaviorDiffNoChange',
  {
    defaultMessage: 'Same categories and counts as the previous run.',
  }
);

export const BEHAVIOR_DIFF_NOT_COMPARABLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.detail.behaviorDiffNotComparable',
  {
    defaultMessage:
      'The compared run is not an earlier run of this sample — read the diff as a side-by-side, not a change over time.',
  }
);

export const BEHAVIOR_DIFF_PRIOR_LINK = (shortId: string) =>
  i18n.translate('xpack.securitySolution.detonatePrototype.detail.behaviorDiffPriorLink', {
    defaultMessage: 'vs run {shortId}',
    values: { shortId },
  });

export const PROPOSAL_BUTTON_LABEL = i18n.translate(
  'xpack.securitySolution.detonatePrototype.detail.proposalButtonLabel',
  {
    defaultMessage: 'Copy exception proposal comment',
  }
);

export const PROPOSAL_TOOLTIP = i18n.translate(
  'xpack.securitySolution.detonatePrototype.detail.proposalTooltip',
  {
    defaultMessage:
      'Copy a comment citing the benign-run streak as evidence for an exception or trusted-application entry. Review before enforcing — a benign run only means no malicious behavior was observed in the sandbox, not that the sample is safe.',
  }
);

export const VERDICT_MALICIOUS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.verdict.malicious',
  { defaultMessage: 'Detonate: malicious' }
);

export const VERDICT_BENIGN = i18n.translate(
  'xpack.securitySolution.detonatePrototype.verdict.benign',
  { defaultMessage: 'Detonate: benign' }
);

export const VERDICT_INCONCLUSIVE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.verdict.inconclusive',
  { defaultMessage: 'Detonate: inconclusive' }
);

export const SERVICE_UNAVAILABLE_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.serviceUnavailableTitle',
  { defaultMessage: 'The detonation service is not reachable' }
);

export const DETONATE_FILE_ACTION = i18n.translate(
  'xpack.securitySolution.detonatePrototype.alertAction.detonateFile',
  { defaultMessage: 'Detonate file' }
);

export const DETONATE_VIEW_REPORT_ACTION = i18n.translate(
  'xpack.securitySolution.detonatePrototype.alertAction.viewReport',
  { defaultMessage: 'View detonation report' }
);

export const SUBMIT_CONFIRM_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.submitConfirm.title',
  { defaultMessage: 'Start a detonation?' }
);

export const SUBMIT_CONFIRM_BODY = i18n.translate(
  'xpack.securitySolution.detonatePrototype.submitConfirm.body',
  {
    defaultMessage:
      'The sample runs in a sandbox VM with Elastic Defend installed. Each run occupies a VM for several minutes.',
  }
);

export const SUBMIT_CONFIRM_CANCEL = i18n.translate(
  'xpack.securitySolution.detonatePrototype.submitConfirm.cancel',
  { defaultMessage: 'Cancel' }
);

export const SUBMIT_READ_ONLY_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.submit.readOnlyTitle',
  { defaultMessage: 'You can view detonations but not submit samples' }
);

export const SUBMIT_READ_ONLY_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detonatePrototype.submit.readOnlyDescription',
  {
    defaultMessage:
      'Submitting a sample requires the Security All privilege or the Detonate sub-feature privilege. Ask your administrator for access.',
  }
);

export const NOTIFY_COMPLETE_TITLE = (sample: string) =>
  i18n.translate('xpack.securitySolution.detonatePrototype.notify.completeTitle', {
    defaultMessage: 'Detonation complete: {sample}',
    values: { sample },
  });

export const NOTIFY_COMPLETE_TEXT = i18n.translate(
  'xpack.securitySolution.detonatePrototype.notify.completeText',
  { defaultMessage: 'The run finished. Open the report for alerts and verdict.' }
);

export const NOTIFY_FAILED_TITLE = (sample: string) =>
  i18n.translate('xpack.securitySolution.detonatePrototype.notify.failedTitle', {
    defaultMessage: 'Detonation failed: {sample}',
    values: { sample },
  });

export const SUBMIT_MODAL_LIMITATIONS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.submitModal.limitations',
  {
    defaultMessage:
      'No anti-evasion hardening and no outbound internet. Samples that check for a VM or need a live C2 may show little activity and return an inconclusive verdict.',
  }
);

export const SUBMIT_MODAL_USAGE = ({ used, allowance }: { used: number; allowance: number }) =>
  i18n.translate('xpack.securitySolution.detonatePrototype.submitModal.usage', {
    defaultMessage: '{used} of {allowance} detonations used this month',
    values: { used, allowance },
  });

export const SUBMIT_MODAL_ALLOWANCE_EXHAUSTED = (resetsAt: string) =>
  i18n.translate('xpack.securitySolution.detonatePrototype.submitModal.allowanceExhausted', {
    defaultMessage:
      'Monthly allowance used. Submitting is disabled until the allowance resets on {resetsAt}.',
    values: { resetsAt },
  });

export const SUBMIT_MODAL_USAGE_UNAVAILABLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.submitModal.usageUnavailable',
  { defaultMessage: 'Allowance unavailable' }
);

export const SUBMIT_MODAL_PRIOR_RUN = i18n.translate(
  'xpack.securitySolution.detonatePrototype.submitModal.priorRun',
  { defaultMessage: 'A completed detonation for this hash exists' }
);

export const SUBMIT_MODAL_PRIOR_RUN_VIEW = i18n.translate(
  'xpack.securitySolution.detonatePrototype.submitModal.priorRunView',
  { defaultMessage: 'View' }
);

export const SUBMIT_MODAL_INVALID_HASH = i18n.translate(
  'xpack.securitySolution.detonatePrototype.submitModal.invalidHash',
  { defaultMessage: 'Enter a valid MD5 (32), SHA-1 (40) or SHA-256 (64) hexadecimal hash.' }
);

export const SUBMIT_SAMPLE_BUTTON = i18n.translate(
  'xpack.securitySolution.detonatePrototype.submitModal.openButton',
  { defaultMessage: 'Submit sample' }
);

export const SUBMIT_MODAL_CANCEL = i18n.translate(
  'xpack.securitySolution.detonatePrototype.submitModal.cancel',
  { defaultMessage: 'Cancel' }
);

export const SUBMIT_MODAL_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.submitModal.title',
  { defaultMessage: 'Submit a sample' }
);

export const SUBMIT_MODAL_VIEW_RESULT = i18n.translate(
  'xpack.securitySolution.detonatePrototype.submitModal.viewResult',
  { defaultMessage: 'View result' }
);

export const SUBMIT_MODAL_SUCCESS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.submitModal.success',
  { defaultMessage: 'Detonation started' }
);

export const META_STATUS = i18n.translate('xpack.securitySolution.detonatePrototype.meta.status', {
  defaultMessage: 'Status',
});

export const META_VERDICT = i18n.translate(
  'xpack.securitySolution.detonatePrototype.meta.verdict',
  { defaultMessage: 'Verdict' }
);

export const META_ALERTS = i18n.translate('xpack.securitySolution.detonatePrototype.meta.alerts', {
  defaultMessage: 'Alerts',
});

export const META_DURATION = i18n.translate(
  'xpack.securitySolution.detonatePrototype.meta.duration',
  { defaultMessage: 'Duration' }
);

export const META_CONFIDENCE_HIGH = i18n.translate(
  'xpack.securitySolution.detonatePrototype.meta.confidenceHigh',
  { defaultMessage: 'High confidence' }
);

export const META_CONFIDENCE_MEDIUM = i18n.translate(
  'xpack.securitySolution.detonatePrototype.meta.confidenceMedium',
  { defaultMessage: 'Medium confidence' }
);

export const META_CONFIDENCE_LOW = i18n.translate(
  'xpack.securitySolution.detonatePrototype.meta.confidenceLow',
  { defaultMessage: 'Low confidence' }
);

export const META_EMPTY = '—';

export const OVERVIEW_AI_SUMMARY_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.aiSummaryTitle',
  { defaultMessage: 'AI summary' }
);

export const OVERVIEW_AI_SUMMARY_NO_VERDICT = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.aiSummaryNoVerdict',
  { defaultMessage: 'No verdict yet' }
);

export const OVERVIEW_AI_SUMMARY_LINE = ({
  verdict,
  confidence,
  evidence,
}: {
  verdict: string;
  confidence: string;
  evidence: string;
}): string =>
  i18n.translate('xpack.securitySolution.detonatePrototype.overview.aiSummaryLine', {
    defaultMessage: '{verdict} · {confidence}. {evidence}',
    values: { verdict, confidence, evidence },
  });

export const OVERVIEW_PROGRESS_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.progressTitle',
  { defaultMessage: 'Detonation progress' }
);

export const OVERVIEW_PROGRESS_WAITING = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.progressWaiting',
  { defaultMessage: 'Waiting for a VM…' }
);

export const OVERVIEW_PROGRESS_DURATION = ({ duration }: { duration: string }): string =>
  i18n.translate('xpack.securitySolution.detonatePrototype.overview.progressDuration', {
    defaultMessage: 'Took {duration}',
    values: { duration },
  });

export const OVERVIEW_SANDBOX_AGENT_ID = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.sandboxAgentId',
  { defaultMessage: 'Sandbox agent ID' }
);

export const OVERVIEW_SANDBOX_AGENT_ID_VALUE = ({ id }: { id: string }): string =>
  i18n.translate('xpack.securitySolution.detonatePrototype.overview.sandboxAgentIdValue', {
    defaultMessage: 'Sandbox agent ID: {id}',
    values: { id },
  });

export const OVERVIEW_QUEUED_NOTE_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.queuedNoteTitle',
  { defaultMessage: 'Waiting for a VM' }
);

export const OVERVIEW_QUEUED_NOTE_BODY = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.queuedNoteBody',
  {
    defaultMessage:
      'The run has not reached a sandbox VM yet. The remaining sections appear once it starts.',
  }
);

export const OVERVIEW_HIGHLIGHTED_FIELDS_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.highlightedFieldsTitle',
  { defaultMessage: 'Highlighted fields' }
);

export const OVERVIEW_FIELD_SHA256 = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.fieldSha256',
  { defaultMessage: 'SHA-256' }
);

export const OVERVIEW_FIELD_FILE_NAME = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.fieldFileName',
  { defaultMessage: 'File name' }
);

export const OVERVIEW_FIELD_OS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.fieldOs',
  { defaultMessage: 'Operating system' }
);

export const OVERVIEW_FIELD_ARCHITECTURE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.fieldArchitecture',
  { defaultMessage: 'Architecture' }
);

export const OVERVIEW_FIELD_INTERNET = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.fieldInternet',
  { defaultMessage: 'Internet access' }
);

export const OVERVIEW_INTERNET_ON = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.internetOn',
  { defaultMessage: 'Enabled' }
);

export const OVERVIEW_INTERNET_OFF = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.internetOff',
  { defaultMessage: 'Disabled' }
);

export const OVERVIEW_FIELD_NETWORK_INDICATORS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.fieldNetworkIndicators',
  { defaultMessage: 'Network indicators' }
);

export const OVERVIEW_FIELD_FILE_INDICATORS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.fieldFileIndicators',
  { defaultMessage: 'File indicators' }
);

export const OVERVIEW_INDICATORS_SHOWN_WITH_MORE = ({
  shown,
  count,
}: {
  shown: string;
  count: number;
}): string =>
  i18n.translate('xpack.securitySolution.detonatePrototype.overview.indicatorsShownWithMore', {
    defaultMessage: '{shown} +{count} more',
    values: { shown, count },
  });

export const OVERVIEW_RECORD_ERROR_FIELD = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.recordErrorField',
  { defaultMessage: 'Could not be read' }
);

export const OVERVIEW_RECORD_ERROR_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.recordErrorTitle',
  { defaultMessage: "The run's record could not be read, so its indicators are not available." }
);

export const OVERVIEW_RECORD_ERROR_RETRY = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.recordErrorRetry',
  { defaultMessage: 'Retry' }
);

export const OVERVIEW_INDICATORS_COMMENT_HEADER = ({ taskId }: { taskId: string }): string =>
  i18n.translate('xpack.securitySolution.detonatePrototype.overview.indicatorsCommentHeader', {
    defaultMessage: 'Indicators observed in detonation run `{taskId}`:',
    values: { taskId },
  });

export const OVERVIEW_INDICATORS_COMMENT_LINE = ({
  type,
  value,
}: {
  type: string;
  value: string;
}): string =>
  i18n.translate('xpack.securitySolution.detonatePrototype.overview.indicatorsCommentLine', {
    defaultMessage: '- {type}: `{value}`',
    values: { type, value },
  });

export const OVERVIEW_NONE_FOUND = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.noneFound',
  { defaultMessage: 'None found' }
);

export const OVERVIEW_NOT_READ = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.notRead',
  { defaultMessage: 'Not read' }
);

export const OVERVIEW_PENDING_UNTIL_COMPLETE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.pendingUntilComplete',
  { defaultMessage: 'Available when the run completes' }
);

export const OVERVIEW_SANDBOX_ALERTS_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.sandboxAlertsTitle',
  { defaultMessage: 'Sandbox alerts' }
);

export const OVERVIEW_SANDBOX_ALERTS_EMPTY_RUNNING = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.sandboxAlertsEmptyRunning',
  { defaultMessage: 'No alerts yet. They appear here as the sandbox raises them.' }
);

export const OVERVIEW_SANDBOX_ALERTS_EMPTY_COMPLETE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.sandboxAlertsEmptyComplete',
  { defaultMessage: 'The sandbox raised no alerts for this run.' }
);

export const OVERVIEW_BEHAVIOR_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.behaviorTitle',
  { defaultMessage: 'Behavior' }
);

export const OVERVIEW_NETWORK_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.networkTitle',
  { defaultMessage: 'Network' }
);

export const OVERVIEW_TELEMETRY_UNAVAILABLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.telemetryUnavailable',
  {
    defaultMessage:
      'Not available yet. Sandbox endpoint telemetry is not collected in this cluster, so there is nothing to summarize here.',
  }
);

export const OVERVIEW_INDICATORS_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.indicatorsTitle',
  { defaultMessage: 'Indicators' }
);

export const OVERVIEW_INDICATORS_EMPTY = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.indicatorsEmpty',
  { defaultMessage: "The run's alerts were read and held no indicators." }
);

export const OVERVIEW_INDICATORS_NOT_READ = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.indicatorsNotRead',
  { defaultMessage: 'Indicators were not read: no alert for this run could be read.' }
);

export const OVERVIEW_INDICATORS_PENDING = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.indicatorsPending',
  { defaultMessage: "Indicators are read from the run's alerts once the run completes." }
);

export const OVERVIEW_INDICATOR_TYPE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.indicatorType',
  { defaultMessage: 'Type' }
);

export const OVERVIEW_INDICATOR_VALUE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.indicatorValue',
  { defaultMessage: 'Value' }
);

export const OVERVIEW_INDICATOR_TYPE_DOMAIN = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.indicatorTypeDomain',
  { defaultMessage: 'Domain' }
);

export const OVERVIEW_INDICATOR_TYPE_IP = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.indicatorTypeIp',
  { defaultMessage: 'IP address' }
);

export const OVERVIEW_INDICATOR_TYPE_FILE_HASH = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.indicatorTypeFileHash',
  { defaultMessage: 'File hash' }
);

export const OVERVIEW_INDICATORS_ADD_TO_CASE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.indicatorsAddToCase',
  { defaultMessage: 'Add all to case' }
);

export const OVERVIEW_INDICATORS_EXPORT_STIX = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.indicatorsExportStix',
  { defaultMessage: 'Export STIX' }
);

export const OVERVIEW_INDICATORS_CREATE_RULE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.indicatorsCreateRule',
  { defaultMessage: 'Create indicator match rule' }
);

export const OVERVIEW_INDICATORS_EXPORT_STIX_EMPTY_TOOLTIP = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.indicatorsExportStixEmptyTooltip',
  {
    defaultMessage:
      'Nothing to export. STIX cannot express any of these indicators, for example hashes of an unknown length.',
  }
);

export const OVERVIEW_INDICATORS_CREATE_RULE_TOOLTIP = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.indicatorsCreateRuleTooltip',
  {
    defaultMessage:
      'Opens rule creation. The indicator match rule type and threat mapping must be filled in there.',
  }
);

export const OVERVIEW_RUN_DETAILS_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.runDetailsTitle',
  { defaultMessage: 'Run details' }
);

export const OVERVIEW_DETAIL_TASK_ID = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.detailTaskId',
  { defaultMessage: 'Task ID' }
);

export const OVERVIEW_DETAIL_ENVIRONMENT = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.detailEnvironment',
  { defaultMessage: 'Environment' }
);

export const OVERVIEW_DETAIL_INTERNET_ON = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.detailInternetOn',
  { defaultMessage: 'internet on' }
);

export const OVERVIEW_DETAIL_INTERNET_OFF = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.detailInternetOff',
  { defaultMessage: 'no internet' }
);

export const OVERVIEW_DETAIL_AGENT_VERSION = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.detailAgentVersion',
  { defaultMessage: 'Agent version' }
);

export const OVERVIEW_DETAIL_TELEMETRY_CLUSTER = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.detailTelemetryCluster',
  { defaultMessage: 'Telemetry cluster' }
);

export const OVERVIEW_DETAIL_SOURCE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.detailSource',
  { defaultMessage: 'Source' }
);

export const OVERVIEW_DETAIL_SUBMITTER = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.detailSubmitter',
  { defaultMessage: 'Submitter' }
);

export const OVERVIEW_DETAIL_WORKFLOW_RUN = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.detailWorkflowRun',
  { defaultMessage: 'Workflow run' }
);

export const OVERVIEW_DETAIL_CONVERSATION = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.detailConversation',
  { defaultMessage: 'Conversation' }
);

export const OVERVIEW_DETAIL_OPEN_WORKFLOW_RUN = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.detailOpenWorkflowRun',
  { defaultMessage: 'Open workflow run' }
);

export const OVERVIEW_DETAIL_OPEN_CONVERSATION = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.detailOpenConversation',
  { defaultMessage: 'Open conversation' }
);

export const OVERVIEW_DETAIL_SUBMITTED = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.detailSubmitted',
  { defaultMessage: 'Submitted' }
);

export const OVERVIEW_DETAIL_TAGS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.overview.detailTags',
  { defaultMessage: 'Tags' }
);

export const FOOTER_ADD_TO_CHAT_PROMPT = i18n.translate(
  'xpack.securitySolution.detonatePrototype.footer.addToChatPrompt',
  { defaultMessage: 'Explain this detonation result and what I should do next.' }
);

export const FOOTER_ADD_TO_CHAT_DESCRIPTION = (taskId: string) =>
  i18n.translate('xpack.securitySolution.detonatePrototype.footer.addToChatDescription', {
    defaultMessage: 'Detonation run {taskId}',
    values: { taskId },
  });

export const FOOTER_RERUN = i18n.translate(
  'xpack.securitySolution.detonatePrototype.footer.rerun',
  { defaultMessage: 'Re-run' }
);

export const FOOTER_RERUN_LONGER_TIMEOUT = i18n.translate(
  'xpack.securitySolution.detonatePrototype.footer.rerunLongerTimeout',
  { defaultMessage: 'Re-run with longer timeout' }
);

export const FOOTER_TAKE_ACTION = i18n.translate(
  'xpack.securitySolution.detonatePrototype.footer.takeAction',
  { defaultMessage: 'Take action' }
);

export const FOOTER_ADD_TO_CASE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.footer.addToCase',
  { defaultMessage: 'Add to case' }
);

export const FOOTER_ADD_TO_CASE_NO_INDICATORS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.footer.addToCaseNoIndicators',
  {
    defaultMessage:
      'No indicators to attach. This run has no extracted domains, IPs or file hashes.',
  }
);

export const FOOTER_SHARE_LINK = i18n.translate(
  'xpack.securitySolution.detonatePrototype.footer.shareLink',
  { defaultMessage: 'Share link' }
);

export const FOOTER_SHARE_LINK_COPIED = i18n.translate(
  'xpack.securitySolution.detonatePrototype.footer.shareLinkCopied',
  { defaultMessage: 'Link copied to clipboard' }
);

export const FOOTER_BLOCK_HASH = i18n.translate(
  'xpack.securitySolution.detonatePrototype.footer.blockHash',
  { defaultMessage: 'Block hash' }
);

export const FOOTER_BLOCK_HASH_NO_HASH = i18n.translate(
  'xpack.securitySolution.detonatePrototype.footer.blockHashNoHash',
  { defaultMessage: 'This run has no sha256 to block.' }
);

export const FOOTER_BLOCK_HASH_NO_PRIVILEGE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.footer.blockHashNoPrivilege',
  { defaultMessage: 'You need Endpoint blocklist write privilege to block a hash.' }
);

export const FOOTER_BLOCK_HASH_NO_GLOBAL_PRIVILEGE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.footer.blockHashNoGlobalPrivilege',
  {
    defaultMessage:
      'Blocking a hash for all policies requires the global artifact management privilege.',
  }
);

export const FOOTER_CREATE_EXCEPTION = i18n.translate(
  'xpack.securitySolution.detonatePrototype.footer.createException',
  { defaultMessage: 'Create trusted app exception' }
);

export const FOOTER_CREATE_EXCEPTION_HASH_COPIED = i18n.translate(
  'xpack.securitySolution.detonatePrototype.footer.createExceptionHashCopied',
  { defaultMessage: 'File hash copied. Paste it into the hash field of the new trusted app.' }
);

export const FOOTER_CREATE_EXCEPTION_HASH_COPY_FAILED = i18n.translate(
  'xpack.securitySolution.detonatePrototype.footer.createExceptionHashCopyFailed',
  { defaultMessage: 'Could not copy the file hash. Copy it from the run details.' }
);

export const FOOTER_BLOCK_HASH_CONFIRM_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.footer.blockHashConfirmTitle',
  { defaultMessage: 'Block this hash?' }
);

export const FOOTER_BLOCK_HASH_CONFIRM_BODY = (hash: string) =>
  i18n.translate('xpack.securitySolution.detonatePrototype.footer.blockHashConfirmBody', {
    defaultMessage:
      'This blocks {hash} on Windows, macOS and Linux for all policies. Endpoint will block this file from running.',
    values: { hash },
  });

export const FOOTER_BLOCK_HASH_CONFIRM = i18n.translate(
  'xpack.securitySolution.detonatePrototype.footer.blockHashConfirm',
  { defaultMessage: 'Block hash' }
);

export const FOOTER_BLOCK_HASH_CANCEL = i18n.translate(
  'xpack.securitySolution.detonatePrototype.footer.blockHashCancel',
  { defaultMessage: 'Cancel' }
);

export const FOOTER_BLOCK_HASH_NAME = (hash: string) =>
  i18n.translate('xpack.securitySolution.detonatePrototype.footer.blockHashName', {
    defaultMessage: 'Detonation: {hash}',
    values: { hash },
  });

export const FOOTER_BLOCK_HASH_DESCRIPTION = (taskId: string) =>
  i18n.translate('xpack.securitySolution.detonatePrototype.footer.blockHashDescription', {
    defaultMessage: 'Blocked from the result of detonation run {taskId}.',
    values: { taskId },
  });

export const FOOTER_BLOCK_HASH_SUCCESS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.footer.blockHashSuccess',
  { defaultMessage: 'Hash added to the Endpoint blocklist' }
);

export const FOOTER_BLOCK_HASH_ERROR = i18n.translate(
  'xpack.securitySolution.detonatePrototype.footer.blockHashError',
  { defaultMessage: 'Could not add the hash to the Endpoint blocklist' }
);

export const FOOTER_BLOCK_HASH_PARTIAL = (failedOs: string) =>
  i18n.translate('xpack.securitySolution.detonatePrototype.footer.blockHashPartial', {
    defaultMessage: 'The hash was not added to the Endpoint blocklist on: {failedOs}',
    values: { failedOs },
  });

export const FOOTER_BLOCK_HASH_PARTIAL_SUCCESS = (os: string) =>
  i18n.translate('xpack.securitySolution.detonatePrototype.footer.blockHashPartialSuccess', {
    defaultMessage: 'The hash was added to the Endpoint blocklist on: {os}',
    values: { os },
  });

export const FOOTER_BLOCK_HASH_ALREADY_BLOCKED = (os: string) =>
  i18n.translate('xpack.securitySolution.detonatePrototype.footer.blockHashAlreadyBlocked', {
    defaultMessage: 'The hash is already blocked on: {os}',
    values: { os },
  });

export const FOOTER_SHARE_LINK_COPY_FAILED = i18n.translate(
  'xpack.securitySolution.detonatePrototype.footer.shareLinkCopyFailed',
  { defaultMessage: 'Could not copy the link to the clipboard' }
);

export const FOOTER_FAILED_NOTE_FALLBACK = (worker: string) =>
  i18n.translate('xpack.securitySolution.detonatePrototype.footer.failedNoteFallback', {
    defaultMessage: 'The run failed in the {worker} step.',
    values: { worker },
  });

export const DASHBOARD_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.dashboard.title',
  { defaultMessage: 'Detonations overview' }
);

export const DASHBOARD_KQL_PLACEHOLDER = i18n.translate(
  'xpack.securitySolution.detonatePrototype.dashboard.kqlPlaceholder',
  { defaultMessage: 'Filter detonations using KQL, e.g. detonate.verdict:malicious' }
);

export const DASHBOARD_FILTER_ERROR_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.dashboard.filterErrorTitle',
  { defaultMessage: 'The filter was rejected' }
);

export const DASHBOARD_PANEL_ERROR = i18n.translate(
  'xpack.securitySolution.detonatePrototype.dashboard.panelError',
  { defaultMessage: 'Could not load this panel' }
);

export const DASHBOARD_PANEL_EMPTY = i18n.translate(
  'xpack.securitySolution.detonatePrototype.dashboard.panelEmpty',
  { defaultMessage: 'No detonations in this range' }
);

export const DASHBOARD_NO_DATA = i18n.translate(
  'xpack.securitySolution.detonatePrototype.dashboard.noData',
  { defaultMessage: 'No data' }
);

export const DASHBOARD_NO_DURATION_TOOLTIP = i18n.translate(
  'xpack.securitySolution.detonatePrototype.dashboard.noDurationTooltip',
  { defaultMessage: 'No detonation in this range has finished with a recorded duration' }
);

export const DASHBOARD_NO_RUNS_TOOLTIP = i18n.translate(
  'xpack.securitySolution.detonatePrototype.dashboard.noRunsTooltip',
  { defaultMessage: 'No detonations match the time range and filters' }
);

export const DASHBOARD_KPI_DETONATIONS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.dashboard.kpi.detonations',
  { defaultMessage: 'Detonations' }
);

export const DASHBOARD_KPI_MEAN_TIME = i18n.translate(
  'xpack.securitySolution.detonatePrototype.dashboard.kpi.meanTime',
  { defaultMessage: 'Mean time to result' }
);

export const DASHBOARD_KPI_ALERTS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.dashboard.kpi.alerts',
  { defaultMessage: 'Alerts across detonations' }
);

export const DASHBOARD_KPI_ALERTS_SPLIT = ({
  siem,
  endpoint,
}: {
  siem: string;
  endpoint: string;
}): string =>
  i18n.translate('xpack.securitySolution.detonatePrototype.dashboard.kpi.alertsSplit', {
    defaultMessage: '{siem} SIEM · {endpoint} endpoint',
    values: { siem, endpoint },
  });

export const DASHBOARD_VERDICTS_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.dashboard.verdicts.title',
  { defaultMessage: 'Verdicts' }
);

export const DASHBOARD_VERDICT_UNKNOWN = i18n.translate(
  'xpack.securitySolution.detonatePrototype.dashboard.verdicts.unknown',
  { defaultMessage: 'No verdict yet' }
);

export const DASHBOARD_TREND_TITLE = (days: number): string =>
  i18n.translate('xpack.securitySolution.detonatePrototype.dashboard.trend.title', {
    defaultMessage: 'Detonations per {days, plural, one {day} other {# days}}, by verdict',
    values: { days },
  });

export const DASHBOARD_TREND_X_AXIS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.dashboard.trend.xAxis',
  { defaultMessage: 'Date' }
);

export const DASHBOARD_TREND_Y_AXIS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.dashboard.trend.yAxis',
  { defaultMessage: 'Detonations' }
);

export const DASHBOARD_TOP_RULES_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.dashboard.topRules.title',
  { defaultMessage: 'Top detection rules' }
);

export const DASHBOARD_TOP_EVENT_CODES_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.dashboard.topEventCodes.title',
  { defaultMessage: 'Top endpoint event codes' }
);

export const DASHBOARD_TOP_TERMS_EMPTY = i18n.translate(
  'xpack.securitySolution.detonatePrototype.dashboard.topTerms.empty',
  { defaultMessage: 'No alerts recorded in this range' }
);

export const ALERT_CARD_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.alertCard.title',
  { defaultMessage: 'Malware analysis' }
);

export const ALERT_CARD_OPEN_RESULT = i18n.translate(
  'xpack.securitySolution.detonatePrototype.alertCard.openResult',
  { defaultMessage: 'Open result' }
);

export const ALERT_CARD_COUNT = (label: string, count: number) =>
  i18n.translate('xpack.securitySolution.detonatePrototype.alertCard.count', {
    defaultMessage: '{label}: {count}',
    values: { label, count },
  });

export const ALERT_CARD_BEHAVIORS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.alertCard.behaviors',
  { defaultMessage: 'Behaviors' }
);

export const ALERT_CARD_IOCS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.alertCard.iocs',
  { defaultMessage: 'Indicators' }
);

export const ALERT_CARD_NOT_ANALYZED_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detonatePrototype.alertCard.notAnalyzedDescription',
  { defaultMessage: "This file hasn't been detonated." }
);

export const ALERT_CARD_PRIOR_RUN_ELSEWHERE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.alertCard.priorRunElsewhere',
  { defaultMessage: 'Detonated before, from another alert.' }
);

export const ALERT_CARD_ALERT_RUNS_UNAVAILABLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.alertCard.alertRunsUnavailable',
  { defaultMessage: "Couldn't load this alert's own detonations." }
);

export const ALERT_CARD_FAILED_FALLBACK = i18n.translate(
  'xpack.securitySolution.detonatePrototype.alertCard.failedFallback',
  { defaultMessage: 'The detonation did not finish.' }
);

export const ALERT_CARD_SUPPORTED_OSES = (osList: string) =>
  i18n.translate('xpack.securitySolution.detonatePrototype.alertCard.supportedOses', {
    defaultMessage: 'Supported operating systems: {osList}.',
    values: { osList },
  });

export const ALERT_CARD_OS_LINUX = i18n.translate(
  'xpack.securitySolution.detonatePrototype.alertCard.osLinux',
  { defaultMessage: 'Linux' }
);

export const ALERT_CARD_OS_WINDOWS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.alertCard.osWindows',
  { defaultMessage: 'Windows' }
);

export const ALERT_CARD_OS_MACOS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.alertCard.osMacos',
  { defaultMessage: 'macOS' }
);

export const RESPONSE_RUNS_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.responseRuns.title',
  { defaultMessage: 'Detonations issued from this alert' }
);

export const RESPONSE_RUNS_EMPTY = i18n.translate(
  'xpack.securitySolution.detonatePrototype.responseRuns.empty',
  { defaultMessage: 'No detonations have been issued from this alert.' }
);

export const RESPONSE_RUNS_ERROR = i18n.translate(
  'xpack.securitySolution.detonatePrototype.responseRuns.error',
  { defaultMessage: 'Could not load the detonations issued from this alert.' }
);

export const RESPONSE_RUNS_COLUMN_TIME = i18n.translate(
  'xpack.securitySolution.detonatePrototype.responseRuns.columnTime',
  { defaultMessage: 'Time' }
);

export const RESPONSE_RUNS_COLUMN_SUBMITTER = i18n.translate(
  'xpack.securitySolution.detonatePrototype.responseRuns.columnSubmitter',
  { defaultMessage: 'Submitted by' }
);

export const RESPONSE_RUNS_COLUMN_STATUS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.responseRuns.columnStatus',
  { defaultMessage: 'Status' }
);

export const RESPONSE_RUNS_COLUMN_RESULT = i18n.translate(
  'xpack.securitySolution.detonatePrototype.responseRuns.columnResult',
  { defaultMessage: 'Result' }
);

export const RESPONSE_RUNS_OPEN = i18n.translate(
  'xpack.securitySolution.detonatePrototype.responseRuns.open',
  { defaultMessage: 'Open' }
);

export const GROUP_BY_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.groupByTitle',
  { defaultMessage: 'Group detonations by' }
);

export const GROUP_BY_DETONATION = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.groupByDetonation',
  { defaultMessage: 'Detonation' }
);

export const GROUP_BY_VERDICT = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.groupByVerdict',
  { defaultMessage: 'Verdict' }
);

export const GROUP_BY_SAMPLE_HASH = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.groupBySampleHash',
  { defaultMessage: 'Sample hash' }
);

export const GROUP_BY_SOURCE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.groupBySource',
  { defaultMessage: 'Source' }
);

export const GROUP_BY_HOST = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.groupByHost',
  { defaultMessage: 'Originating host' }
);

export const GROUP_BY_USER = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.groupByUser',
  { defaultMessage: 'Originating user' }
);

export const GROUP_BY_RULE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.groupByRule',
  { defaultMessage: 'Rule' }
);

export const NO_VERDICT = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.noVerdict',
  { defaultMessage: 'No verdict' }
);

export const NO_VALUE_GROUP = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.noValueGroup',
  { defaultMessage: 'Not set' }
);

export const GROUP_STAT_RUNS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.groupStatRuns',
  { defaultMessage: 'Runs' }
);

export const GROUP_STAT_VERDICTS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.groupStatVerdicts',
  { defaultMessage: 'Verdicts' }
);

export const GROUP_STAT_ALERTS = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.groupStatAlerts',
  { defaultMessage: 'Alerts' }
);

export const GROUP_RUNS_UNIT = (count: number) =>
  i18n.translate('xpack.securitySolution.detonatePrototype.runs.groupRunsUnit', {
    defaultMessage: '{count, plural, one {run} other {runs}}',
    values: { count },
  });

export const GROUPS_UNIT = (count: number) =>
  i18n.translate('xpack.securitySolution.detonatePrototype.runs.groupsUnit', {
    defaultMessage: '{count, plural, one {group} other {groups}}',
    values: { count },
  });

export const GROUPS_ERROR_TITLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.groupsErrorTitle',
  { defaultMessage: 'Could not load the groups' }
);

export const GROUPS_EMPTY = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.groupsEmpty',
  { defaultMessage: 'No detonations match.' }
);

export const GROUP_OPEN_DETONATION = (name: string) =>
  i18n.translate('xpack.securitySolution.detonatePrototype.runs.groupOpenDetonation', {
    defaultMessage: 'Open the result for {name}',
    values: { name },
  });

export const ORIGINATING_ALERTS_TITLE = (count: number) =>
  i18n.translate('xpack.securitySolution.detonatePrototype.runs.originatingAlertsTitle', {
    defaultMessage: '{count, plural, one {Originating alert} other {Originating alerts}}',
    values: { count },
  });

export const ORIGINATING_ALERT_NOT_AVAILABLE = i18n.translate(
  'xpack.securitySolution.detonatePrototype.runs.originatingAlertNotAvailable',
  { defaultMessage: 'Originating alert not available' }
);

export const ORIGINATING_ALERTS_MORE = (count: number) =>
  i18n.translate('xpack.securitySolution.detonatePrototype.runs.originatingAlertsMore', {
    defaultMessage: '+{count} more',
    values: { count },
  });

export const ORIGINATING_ALERT_OPEN = (name: string) =>
  i18n.translate('xpack.securitySolution.detonatePrototype.runs.originatingAlertOpen', {
    defaultMessage: 'Open the alert {name}',
    values: { name },
  });
