/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IconType } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { DaybreakProposal } from '../../../services/proposals_service';

/**
 * The three readiness tiers a Proposal's gate state can be in (FR-016),
 * ported from the Throughline (NotDaybreak) prototype's gate taxonomy — see
 * `.ao/recon.md` section 4.2: "read & gather auto-runs / assemble & draft
 * proposed as a diff / world-changing actions need approval". The prototype
 * source itself is not vendored yet (`.ao/blocked.md`, FR-001), so the tier
 * derivation below is grounded directly in the server's fail-closed
 * readiness gate (`server/client/proposals/gate.ts:62`'s
 * `evaluateReadinessGate`) rather than any prototype literal:
 *
 * - `auto`: neither evidence nor a recommendation exists yet — the Proposal
 *   is still in the "read & gather" phase and requires no human input.
 * - `propose`: exactly one of evidence/recommendation exists — the Proposal
 *   has a partial draft assembled ("assemble & draft proposed as a diff")
 *   but is not yet gate-ready.
 * - `approval-required`: both evidence and a recommendation exist — the
 *   Proposal would pass `evaluateReadinessGate` for the `approved`
 *   transition (server/client/proposals/gate.ts:66's fail-closed check
 *   applies only to `approved`) and is blocked solely on a human approval
 *   click, matching the prototype's "world-changing actions need approval".
 */
export type GateTier = 'auto' | 'propose' | 'approval-required';

/** Every {@link GateTier}, in ascending order of human-approval weight. */
export const GATE_TIERS: readonly GateTier[] = ['auto', 'propose', 'approval-required'];

interface GateTierMeta {
  /** EUI icon rendered next to the tier badge. */
  icon: IconType;
  /** EuiBadge-compatible color per tier. */
  color: 'hollow' | 'primary' | 'warning';
  /** Human-readable label. */
  label: () => string;
}

/** Metadata per {@link GateTier} — icon, badge color, and label (FR-016). */
export const GATE_TIER_META: Record<GateTier, GateTierMeta> = {
  auto: {
    icon: 'play',
    color: 'hollow',
    label: () => i18n.translate('xpack.daybreak.gate.tier.auto', { defaultMessage: 'Auto-run' }),
  },
  propose: {
    icon: 'documentEdit',
    color: 'primary',
    label: () => i18n.translate('xpack.daybreak.gate.tier.propose', { defaultMessage: 'Proposed' }),
  },
  'approval-required': {
    icon: 'lock',
    color: 'warning',
    label: () =>
      i18n.translate('xpack.daybreak.gate.tier.approvalRequired', {
        defaultMessage: 'Approval required',
      }),
  },
};

const hasEvidence = (proposal: DaybreakProposal): boolean => proposal.evidenceRefs.length > 0;

const hasRecommendation = (proposal: DaybreakProposal): boolean =>
  Boolean(proposal.recommendation && proposal.recommendation.trim().length > 0);

/**
 * Derives a Proposal's {@link GateTier} from the same evidence/recommendation
 * signals `evaluateReadinessGate` checks server-side (FR-016). This is a
 * presentation-only mirror for tier bucketing — the gate itself stays
 * server-side and is re-enforced (fail-closed, 422) by the transition route;
 * this function never grants approval, it only labels the current state
 * (same rationale as `brief_dashboard.tsx`'s `isGateReady`).
 */
export const deriveGateTier = (proposal: DaybreakProposal): GateTier => {
  const evidence = hasEvidence(proposal);
  const recommendation = hasRecommendation(proposal);

  if (evidence && recommendation) {
    return 'approval-required';
  }

  if (evidence || recommendation) {
    return 'propose';
  }

  return 'auto';
};
