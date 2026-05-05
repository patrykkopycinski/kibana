/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import type {
  ArgusAutonomyDecision,
  ArgusAutonomyResponse,
  ArgusMutationRow,
  ArgusMutationsResponse,
  ArgusMutationVerdictResponse,
} from '@kbn/argus-console-common';

import { InboxPanel } from './inbox_panel';
import type { ArgusHttp, FetchState } from '../../hooks';

/**
 * The panel only depends on three hooks; mock them at the module boundary
 * so each test can set its own success/error/loading shape without
 * standing up the full @kbn/argus-console-common HTTP harness.
 */
const mockUseMutations = jest.fn();
const mockUseAutonomyDecisions = jest.fn();
const mockSubmitVerdict = jest.fn();

jest.mock('../../hooks', () => {
  const actual = jest.requireActual('../../hooks');
  return {
    ...actual,
    useMutations: (args: unknown) => mockUseMutations(args),
    useAutonomyDecisions: (args: unknown) => mockUseAutonomyDecisions(args),
    useMutationApproval: () => ({ submitting: false, submit: mockSubmitVerdict }),
  };
});

const blockedMutation = (overrides: Partial<ArgusMutationRow> = {}): ArgusMutationRow => ({
  timestamp: '2026-05-05T11:00:00.000Z',
  verdict: 'blocked',
  mutation_intent_id: 'mut-1',
  rule_id: 'rule-A',
  label: 'GCP service-account privilege escalation',
  title: 'Block IAM grant from compromised SA',
  subtitle: 'Trust tier bronze; needs silver',
  actor_id: 'agent-mutator-3',
  actor_trust_tier: 'bronze',
  applied_at: null,
  rolled_back_at: null,
  rollback_mttr_ms: null,
  rollback_reason: null,
  gate_status: 'blocked',
  gate_reason: 'Proposing actor trust tier (bronze) below required floor (silver)',
  ...overrides,
});

const requiredHumanDecision = (
  overrides: Partial<ArgusAutonomyDecision> = {}
): ArgusAutonomyDecision => ({
  id: 'auto-1',
  timestamp: '2026-05-05T10:30:00.000Z',
  artifact_id: 'argus.lateral_movement.smb_admin_share_use',
  artifact_type: 'rule',
  kibana_rule_name: 'Lateral movement via SMB admin share use',
  action: 'enable_rule',
  final_status: 'required_human',
  review_reason: 'Backtest precision below 0.85 floor — needs analyst sign-off',
  trust_tier: 'silver',
  ...overrides,
});

const successfulMutationsState = (
  rows: readonly ArgusMutationRow[]
): FetchState<ArgusMutationsResponse> => ({
  status: 'success',
  data: {
    window_start: 'now-7d',
    window_end: 'now',
    filter: 'blocked',
    counts: { applied: 0, rolled_back: 0, blocked: rows.length },
    rows,
    truncated: false,
  },
});

const successfulAutonomyState = (
  decisions: readonly ArgusAutonomyDecision[]
): FetchState<ArgusAutonomyResponse> => ({
  status: 'success',
  data: {
    window_start: 'now-7d',
    window_end: 'now',
    decisions,
    counts: {
      total: decisions.length,
      auto_applied: 0,
      deferred: 0,
      required_human: decisions.filter((d) => d.final_status === 'required_human').length,
      rejected: 0,
      rolled_back: 0,
    },
    truncated: false,
  },
});

const fakeHttp: ArgusHttp = { fetch: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('InboxPanel', () => {
  it('renders the empty-state callout when no items are pending', () => {
    mockUseMutations.mockReturnValue(successfulMutationsState([]));
    mockUseAutonomyDecisions.mockReturnValue(successfulAutonomyState([]));

    render(<InboxPanel http={fakeHttp} canApproveMutations={true} />);

    expect(screen.getByTestId('argusInboxEmpty')).toBeInTheDocument();
    expect(screen.getByTestId('argusInboxBadgeMutation')).toHaveTextContent('0 mutations');
    expect(screen.getByTestId('argusInboxBadgeAutonomy')).toHaveTextContent('0 autonomy');
  });

  it('lists blocked mutations and human-flagged autonomy decisions side by side', () => {
    mockUseMutations.mockReturnValue(successfulMutationsState([blockedMutation()]));
    mockUseAutonomyDecisions.mockReturnValue(successfulAutonomyState([requiredHumanDecision()]));

    render(<InboxPanel http={fakeHttp} canApproveMutations={true} />);

    expect(screen.getByTestId('argusInboxBadgeMutation')).toHaveTextContent('1 mutation');
    expect(screen.getByTestId('argusInboxBadgeAutonomy')).toHaveTextContent('1 autonomy');
    expect(screen.getByText('GCP service-account privilege escalation')).toBeInTheDocument();
    expect(screen.getByText('Lateral movement via SMB admin share use')).toBeInTheDocument();
  });

  it('filters out autonomy decisions that are not flagged required_human', () => {
    mockUseMutations.mockReturnValue(successfulMutationsState([]));
    mockUseAutonomyDecisions.mockReturnValue(
      successfulAutonomyState([
        requiredHumanDecision({ id: 'a', kibana_rule_name: 'human-needed' }),
        requiredHumanDecision({
          id: 'b',
          kibana_rule_name: 'auto-applied',
          final_status: 'auto_applied',
        }),
      ])
    );

    render(<InboxPanel http={fakeHttp} canApproveMutations={true} />);

    expect(screen.getByText('human-needed')).toBeInTheDocument();
    expect(screen.queryByText('auto-applied')).not.toBeInTheDocument();
  });

  it('hides the row-action buttons and shows a "Decision needed" badge when canApproveMutations is false', () => {
    mockUseMutations.mockReturnValue(successfulMutationsState([blockedMutation()]));
    mockUseAutonomyDecisions.mockReturnValue(successfulAutonomyState([]));

    render(<InboxPanel http={fakeHttp} canApproveMutations={false} />);

    expect(screen.queryByTestId('argusInboxApprove-mut-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('argusInboxReject-mut-1')).not.toBeInTheDocument();
    expect(screen.getByText('Decision needed')).toBeInTheDocument();
  });

  it('blocks the Reject confirm button until the analyst types a reason and submits with it', async () => {
    mockUseMutations.mockReturnValue(successfulMutationsState([blockedMutation()]));
    mockUseAutonomyDecisions.mockReturnValue(successfulAutonomyState([]));
    const verdictResponse: ArgusMutationVerdictResponse = {
      mutation_intent_id: 'mut-1',
      action: 'reject',
      previous_status: 'blocked',
      new_status: 'rejected_by_human',
      audit_id: 'audit-1',
      reason: 'False positive on noisy host',
    };
    mockSubmitVerdict.mockResolvedValue(verdictResponse);

    render(<InboxPanel http={fakeHttp} canApproveMutations={true} />);

    fireEvent.click(screen.getByTestId('argusInboxReject-mut-1'));

    const modal = await screen.findByTestId('argusInboxVerdictModal');
    const confirmButton = within(modal).getByRole('button', { name: 'Reject' });
    expect(confirmButton).toBeDisabled();

    const textarea = screen.getByTestId('argusInboxVerdictReason');
    fireEvent.change(textarea, { target: { value: 'False positive on noisy host' } });

    expect(confirmButton).not.toBeDisabled();
    fireEvent.click(confirmButton);

    await waitFor(() =>
      expect(mockSubmitVerdict).toHaveBeenCalledWith('reject', {
        mutationIntentId: 'mut-1',
        reason: 'False positive on noisy host',
      })
    );
  });

  it('approves a mutation without requiring a reason', async () => {
    mockUseMutations.mockReturnValue(successfulMutationsState([blockedMutation()]));
    mockUseAutonomyDecisions.mockReturnValue(successfulAutonomyState([]));
    mockSubmitVerdict.mockResolvedValue({
      mutation_intent_id: 'mut-1',
      action: 'approve',
      new_status: 'approved_by_human',
      audit_id: 'audit-2',
    });

    render(<InboxPanel http={fakeHttp} canApproveMutations={true} />);

    fireEvent.click(screen.getByTestId('argusInboxApprove-mut-1'));

    const modal = await screen.findByTestId('argusInboxVerdictModal');
    const confirmButton = within(modal).getByRole('button', { name: 'Approve' });
    // Approve does not require a reason — confirm button is enabled
    // immediately so the operator isn't blocked on a no-context approval.
    expect(confirmButton).not.toBeDisabled();
    fireEvent.click(confirmButton);

    await waitFor(() =>
      expect(mockSubmitVerdict).toHaveBeenCalledWith('approve', {
        mutationIntentId: 'mut-1',
        reason: undefined,
      })
    );
  });

  it('pivots to the Governance tab when the analyst opens an autonomy decision', () => {
    mockUseMutations.mockReturnValue(successfulMutationsState([]));
    mockUseAutonomyDecisions.mockReturnValue(successfulAutonomyState([requiredHumanDecision()]));
    const onOpenAutonomyDecision = jest.fn();

    render(
      <InboxPanel
        http={fakeHttp}
        canApproveMutations={true}
        onOpenAutonomyDecision={onOpenAutonomyDecision}
      />
    );

    fireEvent.click(screen.getByTestId('argusInboxOpenAutonomy-auto-1'));

    expect(onOpenAutonomyDecision).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'auto-1', final_status: 'required_human' })
    );
  });

  it('surfaces a callout when either feed errors out', () => {
    mockUseMutations.mockReturnValue({
      status: 'error',
      error: new Error('mutations route 500'),
    } satisfies FetchState<ArgusMutationsResponse>);
    mockUseAutonomyDecisions.mockReturnValue(successfulAutonomyState([]));

    render(<InboxPanel http={fakeHttp} canApproveMutations={true} />);

    expect(screen.getByTestId('argusInboxErrorCallout')).toBeInTheDocument();
    expect(screen.getByText('mutations route 500')).toBeInTheDocument();
  });
});
