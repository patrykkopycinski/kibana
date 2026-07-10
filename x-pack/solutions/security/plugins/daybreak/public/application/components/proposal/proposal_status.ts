/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { DaybreakProposal } from '../../../services/proposals_service';

/**
 * Browser-local alias for the 7-value {@link DaybreakProposal} `status`
 * union (FR-019). Kept as its own type (rather than re-declaring the union)
 * so `ProposalInspector` and other status-rendering surfaces share a single
 * source of truth for the value set and its exhaustiveness tests.
 */
export type ProposalStatusValue = DaybreakProposal['status'];

/**
 * Every {@link ProposalStatusValue}, in the server union's declared order
 * (`server/client/proposals/types.ts`'s `ProposalStatus`, mirrored browser-side
 * per the public/server boundary convention — see `proposals_service.ts`).
 * Materialised as a tuple, mirroring `THREAD_TYPES`
 * (`thread/thread_type.ts`), so tests can assert exhaustiveness against the
 * full 7-value set without importing the type system (FR-019).
 */
export const PROPOSAL_STATUS_VALUES: readonly ProposalStatusValue[] = [
  'new',
  'needs-evidence',
  'approved',
  'modified',
  'dismissed',
  'escalated',
  'deferred',
];

/** EuiBadge-compatible color per status, chosen for semantic meaning. */
interface ProposalStatusMeta {
  color: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  label: () => string;
}

/**
 * Metadata per {@link ProposalStatusValue} — badge color and label
 * (FR-019, FR-012). Colors follow the same semantic mapping documented in
 * `theme.mapping.md`'s "Semantic tokens" table (success = gate pass /
 * `approved`; warning = `needs-evidence` / `deferred`; danger = gate fail /
 * `escalated`) — using plain EUI named colors rather than
 * {@link daybreakTheme} tokens, matching the existing `severityColor`
 * pattern in `shell.tsx`'s `DaybreakProposalDetail`.
 */
export const PROPOSAL_STATUS_META: Record<ProposalStatusValue, ProposalStatusMeta> = {
  new: {
    color: 'primary',
    label: () => i18n.translate('xpack.daybreak.proposalStatus.new', { defaultMessage: 'New' }),
  },
  'needs-evidence': {
    color: 'warning',
    label: () =>
      i18n.translate('xpack.daybreak.proposalStatus.needsEvidence', {
        defaultMessage: 'Needs evidence',
      }),
  },
  approved: {
    color: 'success',
    label: () =>
      i18n.translate('xpack.daybreak.proposalStatus.approved', { defaultMessage: 'Approved' }),
  },
  modified: {
    color: 'primary',
    label: () =>
      i18n.translate('xpack.daybreak.proposalStatus.modified', { defaultMessage: 'Modified' }),
  },
  dismissed: {
    color: 'default',
    label: () =>
      i18n.translate('xpack.daybreak.proposalStatus.dismissed', { defaultMessage: 'Dismissed' }),
  },
  escalated: {
    color: 'danger',
    label: () =>
      i18n.translate('xpack.daybreak.proposalStatus.escalated', { defaultMessage: 'Escalated' }),
  },
  deferred: {
    color: 'warning',
    label: () =>
      i18n.translate('xpack.daybreak.proposalStatus.deferred', { defaultMessage: 'Deferred' }),
  },
};

/** Type guard narrowing an arbitrary string to a known {@link ProposalStatusValue}. */
export const isProposalStatusValue = (value: string): value is ProposalStatusValue =>
  (PROPOSAL_STATUS_VALUES as readonly string[]).includes(value);
