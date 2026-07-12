/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiAvatar,
  EuiBadge,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPanel,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import type { IconType } from '@elastic/eui';
import type { DaybreakEvidence } from '../../../services/evidence_service';
import type { DaybreakProposal } from '../../../services/proposals_service';
import { PROPOSAL_STATUS_META } from '../proposal/proposal_status';

type AppKey = 'object' | 'discover' | 'records' | 'alerts' | 'entities' | 'dashboards';
type RecordTab = 'overview' | 'evidence' | 'timeline' | 'actions' | 'people';

interface InspectorPanelProps {
  proposal: DaybreakProposal;
  evidence: DaybreakEvidence[];
}

const APP_META: Record<AppKey, { label: string; icon: IconType }> = {
  object: { label: 'Object', icon: 'cube' },
  discover: { label: 'Discover', icon: 'compass' },
  records: { label: 'Records', icon: 'list' },
  alerts: { label: 'Alerts', icon: 'alert' },
  entities: { label: 'Entities', icon: 'users' },
  dashboards: { label: 'Dashboards', icon: 'dashboardApp' },
};

const RECORD_TABS: { id: RecordTab; label: string; icon: IconType }[] = [
  { id: 'overview', label: 'Overview', icon: 'document' },
  { id: 'evidence', label: 'Evidence', icon: 'link' },
  { id: 'timeline', label: 'Timeline', icon: 'clock' },
  { id: 'actions', label: 'Actions', icon: 'bolt' },
  { id: 'people', label: 'People', icon: 'users' },
];

const PlaceholderApp: React.FC<{ app: AppKey }> = ({ app }) => (
  <div className="daybreakInspectorAppPlaceholder">
    <EuiText size="s" color="subdued">
      {APP_META[app].label} integration is not yet wired in this spike.
    </EuiText>
  </div>
);

const EvidenceTab: React.FC<{ evidence: DaybreakEvidence[] }> = ({ evidence }) => (
  <div className="daybreakInspectorEvidence">
    {evidence.length === 0 ? (
      <EuiText size="s" color="subdued">
        No evidence attached.
      </EuiText>
    ) : (
      evidence.map((item, index) => (
        <EuiPanel key={item.id} className="daybreakEvidenceCard" paddingSize="s" hasBorder>
          <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiIcon type="link" />
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiText size="s">
                <strong>Evidence {index + 1}</strong>
              </EuiText>
              <EuiText size="xs" color="subdued">
                {item.id}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPanel>
      ))
    )}
  </div>
);

const TimelineTab: React.FC = () => (
  <div className="daybreakInspectorTimeline">
    <div className="daybreakTimelineRow">
      <span className="daybreakTimelineDot daybreakTimelineDot--now" />
      <EuiText size="s">Proposal opened</EuiText>
    </div>
    <div className="daybreakTimelineRow">
      <span className="daybreakTimelineDot daybreakTimelineDot--flag" />
      <EuiText size="s">Evidence linked</EuiText>
    </div>
    <div className="daybreakTimelineRow">
      <span className="daybreakTimelineDot" />
      <EuiText size="s" color="subdued">
        Awaiting decision
      </EuiText>
    </div>
  </div>
);

const ActionsTab: React.FC<{ proposal: DaybreakProposal }> = ({ proposal }) => (
  <div className="daybreakInspectorActions">
    <EuiText size="xs" className="daybreakEyebrow">
      DECISION HISTORY
    </EuiText>
    <EuiSpacer size="xs" />
    <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiIcon type="document" size="s" />
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiText size="s">Created · {new Date(proposal.createdAt).toLocaleDateString()}</EuiText>
      </EuiFlexItem>
    </EuiFlexGroup>
    {proposal.status === 'approved' && (
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiIcon type="check" color="success" size="s" />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText size="s" color="success">
            Approved by Operator
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    )}
    {proposal.status === 'dismissed' && (
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiIcon type="cross" color="subdued" size="s" />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText size="s" color="subdued">
            Dismissed by Operator
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    )}
    <EuiSpacer size="m" />
    <EuiText size="xs" className="daybreakEyebrow">
      AVAILABLE ACTIONS
    </EuiText>
    <EuiSpacer size="xs" />
    <EuiFlexGroup direction="column" gutterSize="s">
      {proposal.status !== 'approved' && (
        <EuiButtonEmpty iconType="lock" size="s" disabled>
          Isolate host
        </EuiButtonEmpty>
      )}
      <EuiButtonEmpty iconType="user" size="s" disabled>
        Disable account
      </EuiButtonEmpty>
      <EuiButtonEmpty iconType="alert" size="s" disabled>
        Convert to incident
      </EuiButtonEmpty>
    </EuiFlexGroup>
  </div>
);

const PeopleTab: React.FC<{ proposal: DaybreakProposal }> = () => (
  <div className="daybreakInspectorPeople">
    <EuiFlexGroup alignItems="center" gutterSize="s">
      <EuiAvatar name="Operator" size="s" />
      <EuiText size="s">Operator (owner)</EuiText>
    </EuiFlexGroup>
    <EuiSpacer size="s" />
    <EuiButtonEmpty iconType="plus" size="s" disabled>
      Invite or assign
    </EuiButtonEmpty>
  </div>
);

const OverviewTab: React.FC<{ proposal: DaybreakProposal; evidence: DaybreakEvidence[] }> = ({
  proposal,
  evidence,
}) => {
  const status = PROPOSAL_STATUS_META[proposal.status];
  return (
    <div className="daybreakInspectorOverview">
      <EuiPanel className="daybreakInspectorAssessment" paddingSize="s" color="subdued">
        <EuiText size="xs" className="daybreakEyebrow">
          ASSESSMENT
        </EuiText>
        <EuiSpacer size="xs" />
        <EuiText size="s">{proposal.recommendation ?? 'No assessment available yet.'}</EuiText>
      </EuiPanel>
      <EuiSpacer size="s" />
      <EuiText size="xs" className="daybreakEyebrow">
        KEY FINDINGS
      </EuiText>
      <EuiSpacer size="xs" />
      {evidence.length === 0 ? (
        <EuiText size="s" color="subdued">
          No evidence linked.
        </EuiText>
      ) : (
        evidence.map((item) => (
          <EuiFlexGroup key={item.id} alignItems="center" gutterSize="s" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiIcon type="check" color="success" />
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiText size="s">{item.id}</EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        ))
      )}
      <EuiSpacer size="m" />
      <EuiText size="xs" className="daybreakEyebrow">
        STATUS
      </EuiText>
      <EuiSpacer size="xs" />
      <EuiBadge color={status.color}>{status.label()}</EuiBadge>
    </div>
  );
};

const isGateReady = (proposal: DaybreakProposal): boolean =>
  proposal.evidenceRefs.length > 0 && Boolean(proposal.recommendation?.trim());

const ObjectApp: React.FC<{ proposal: DaybreakProposal; evidence: DaybreakEvidence[] }> = ({
  proposal,
  evidence,
}) => {
  const [tab, setTab] = React.useState<RecordTab>('overview');
  const inMotion = isGateReady(proposal) && proposal.status !== 'approved';
  return (
    <div className="daybreakObjectApp">
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem>
          <EuiText size="xs" className="daybreakEyebrow">
            RECORD
          </EuiText>
          <EuiTitle size="xxs">
            <h4>{proposal.title}</h4>
          </EuiTitle>
        </EuiFlexItem>
        {inMotion && (
          <EuiFlexItem grow={false}>
            <EuiBadge color="primary" iconType="play">
              In motion
            </EuiBadge>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiTabs size="s" className="daybreakRecordTabs">
        {RECORD_TABS.map((t) => (
          <EuiTab key={t.id} onClick={() => setTab(t.id)} isSelected={tab === t.id}>
            {t.label}
          </EuiTab>
        ))}
      </EuiTabs>
      <EuiSpacer size="m" />
      {tab === 'overview' && <OverviewTab proposal={proposal} evidence={evidence} />}
      {tab === 'evidence' && <EvidenceTab evidence={evidence} />}
      {tab === 'timeline' && <TimelineTab />}
      {tab === 'actions' && <ActionsTab proposal={proposal} />}
      {tab === 'people' && <PeopleTab proposal={proposal} />}
    </div>
  );
};

export const InspectorPanel: React.FC<InspectorPanelProps> = ({ proposal, evidence }) => {
  const [activeApp, setActiveApp] = React.useState<AppKey>('object');
  const [openApps] = React.useState<AppKey[]>(['object']);

  return (
    <aside className="daybreakInspectorPanel" data-test-subj="daybreakInspectorPanel">
      <div className="daybreakInspectorAppBar">
        <EuiTabs size="s" className="daybreakInspectorTabs">
          {openApps.map((app) => (
            <EuiTab key={app} onClick={() => setActiveApp(app)} isSelected={activeApp === app}>
              <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiIcon type={APP_META[app].icon} size="s" />
                </EuiFlexItem>
                <EuiFlexItem>{APP_META[app].label}</EuiFlexItem>
              </EuiFlexGroup>
            </EuiTab>
          ))}
        </EuiTabs>
        <EuiToolTip content="Add tool">
          <EuiButtonEmpty
            iconType="plus"
            size="xs"
            className="daybreakInspectorAdd"
            aria-label="Add tool"
          />
        </EuiToolTip>
      </div>
      <div className="daybreakInspectorBody">
        {activeApp === 'object' ? (
          <ObjectApp proposal={proposal} evidence={evidence} />
        ) : (
          <PlaceholderApp app={activeApp} />
        )}
      </div>
    </aside>
  );
};
