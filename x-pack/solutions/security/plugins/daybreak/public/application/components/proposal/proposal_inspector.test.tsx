/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { ProposalInspector } from './proposal_inspector';
import { PROPOSAL_STATUS_VALUES, PROPOSAL_STATUS_META } from './proposal_status';
import type { DaybreakProposal } from '../../../services/proposals_service';
import type { DaybreakEvidence } from '../../../services/evidence_service';

/**
 * Base Proposal fixture, overridden per-test with the specific `status`
 * under assertion (FR-019). Mirrors the shape returned by
 * `GET /api/daybreak/proposals`, not any prototype demo-seed data — same
 * rationale as `shell.test.tsx`'s `proposalsFixture`.
 */
const baseProposal: DaybreakProposal = {
  id: 'proposal-1',
  title: 'Suspicious login from new device',
  capability: 'alert-analysis',
  severity: 'high',
  confidence: 0.82,
  status: 'new',
  evidenceRefs: ['evidence-1'],
  createdAt: '2026-07-10T00:00:00.000Z',
};

/**
 * Evidence fixture exercising every {@link DaybreakEvidence} field this
 * task's spec traces explicitly — `kind`, `provenance`, `stance`,
 * `sensitivityLabel` (FR-012, FR-019, FR-022) — plus the remaining fields
 * (`summary`, `confidence`, `sourceRef`, `limitations`) so the inspector's
 * full-detail rendering is covered, not just the four spec-named ones.
 */
const evidenceFixture: DaybreakEvidence = {
  id: 'evidence-1',
  kind: 'alert',
  sourceRef: 'alert-doc-42',
  summary: 'Login originated from a device not previously associated with this user.',
  provenance: 'capability',
  confidence: 0.75,
  stance: 'for',
  limitations: ['Single data point', 'No geo-IP corroboration'],
  sensitivityLabel: 'internal',
  createdAt: '2026-07-10T00:00:00.000Z',
};

const renderInspector = (
  proposal: DaybreakProposal = baseProposal,
  evidence: DaybreakEvidence[] = [evidenceFixture]
) =>
  render(
    <IntlProvider locale="en">
      <ProposalInspector proposal={proposal} evidence={evidence} />
    </IntlProvider>
  );

describe('ProposalInspector (FR-012, FR-019, FR-022)', () => {
  it('renders every EvidenceProperties field the spec names — kind, provenance, stance, sensitivityLabel (FR-012, FR-022)', () => {
    renderInspector();

    expect(screen.getByTestId('daybreakProposalInspector')).toBeInTheDocument();
    expect(screen.getByTestId('daybreakInspectorEvidence-evidence-1')).toBeInTheDocument();

    expect(screen.getByTestId('daybreakInspectorEvidenceKind-evidence-1')).toHaveTextContent(
      'alert'
    );
    expect(screen.getByTestId('daybreakInspectorEvidenceProvenance-evidence-1')).toHaveTextContent(
      'capability'
    );
    expect(screen.getByTestId('daybreakInspectorEvidenceStance-evidence-1')).toHaveTextContent(
      'for'
    );
    expect(screen.getByTestId('daybreakInspectorEvidenceSensitivity-evidence-1')).toHaveTextContent(
      'internal'
    );
  });

  it('renders the remaining EvidenceProperties fields too — summary, confidence, sourceRef, limitations', () => {
    renderInspector();

    expect(screen.getByTestId('daybreakInspectorEvidenceSummary-evidence-1')).toHaveTextContent(
      evidenceFixture.summary
    );
    const details = screen.getByTestId('daybreakInspectorEvidenceDetails-evidence-1');
    expect(details).toHaveTextContent('0.75');
    expect(details).toHaveTextContent('alert-doc-42');
    expect(details).toHaveTextContent('Single data point, No geo-IP corroboration');
  });

  it('renders an evidence card per evidenceRefs entry, keyed by evidence id', () => {
    const secondEvidence: DaybreakEvidence = {
      ...evidenceFixture,
      id: 'evidence-2',
      kind: 'entity',
      stance: 'against',
    };

    renderInspector(baseProposal, [evidenceFixture, secondEvidence]);

    expect(screen.getByTestId('daybreakInspectorEvidence-evidence-1')).toBeInTheDocument();
    expect(screen.getByTestId('daybreakInspectorEvidence-evidence-2')).toBeInTheDocument();
  });

  it('renders an explicit empty state when no evidence is resolved', () => {
    renderInspector(baseProposal, []);

    expect(screen.getByTestId('daybreakProposalInspectorEmpty')).toBeInTheDocument();
    expect(screen.queryByTestId(/daybreakInspectorEvidence-/)).not.toBeInTheDocument();
  });

  describe('7-value ProposalStatus rendering (FR-019)', () => {
    it('exposes exactly the 7 expected status values', () => {
      expect(PROPOSAL_STATUS_VALUES).toEqual([
        'new',
        'needs-evidence',
        'approved',
        'modified',
        'dismissed',
        'escalated',
        'deferred',
      ]);
    });

    it.each(PROPOSAL_STATUS_VALUES)(
      'renders a status badge with the status-scoped test subject and label for "%s"',
      (status) => {
        const { unmount } = renderInspector({ ...baseProposal, status });

        const badge = screen.getByTestId(`daybreakProposalInspectorStatus-${status}`);
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveTextContent(PROPOSAL_STATUS_META[status].label());

        unmount();
      }
    );
  });
});
