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
  EuiButton,
  EuiButtonEmpty,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import type { DaybreakProposal } from '../../../services/proposals_service';
import { PROPOSAL_STATUS_META } from '../proposal/proposal_status';

export interface ThreadMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  name?: string;
}

export type ThreadType = 'chat' | 'case' | 'investigation' | 'hunt' | 'incident';

interface ThreadViewProps {
  proposal: DaybreakProposal;
  type?: ThreadType;
}

const typeMeta: Record<ThreadType, { label: string; icon: string; color: string }> = {
  chat: { label: 'Chat', icon: 'discuss', color: '#7e8796' },
  case: { label: 'Case', icon: 'casesApp', color: '#1769d3' },
  investigation: { label: 'Investigation', icon: 'magnifyWithExclamation', color: '#d4791a' },
  hunt: { label: 'Hunt', icon: 'crosshairs', color: '#00bfb3' },
  incident: { label: 'Incident', icon: 'alert', color: '#bd271e' },
};

const severityColor: Record<DaybreakProposal['severity'], string> = {
  critical: '#bd271e',
  high: '#d4791a',
  medium: '#1769d3',
  low: '#00bfb3',
};

const deriveThreadType = (proposal: DaybreakProposal): ThreadType => {
  if (proposal.severity === 'critical') return 'incident';
  if (proposal.severity === 'high') return 'investigation';
  if (proposal.severity === 'medium') return 'case';
  if (proposal.status === 'new') return 'chat';
  return 'case';
};

const defaultStarters = [
  'What evidence supports this?',
  'Draft a containment plan',
  'Show similar historical cases',
];

const isGateReady = (proposal: DaybreakProposal): boolean =>
  proposal.evidenceRefs.length > 0 && Boolean(proposal.recommendation?.trim());

const SpineHeader: React.FC<{ proposal: DaybreakProposal; type: ThreadType }> = ({
  proposal,
  type,
}) => {
  const meta = typeMeta[type];
  const status = PROPOSAL_STATUS_META[proposal.status];
  const inMotion = isGateReady(proposal) && proposal.status !== 'approved';
  return (
    <EuiPanel className="daybreakSpineHeader" hasBorder={false} hasShadow={false} paddingSize="m">
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
        <EuiFlexItem>
          <EuiFlexGroup alignItems="center" gutterSize="s">
            <EuiFlexItem grow={false}>
              <EuiBadge color={meta.color}>{meta.label}</EuiBadge>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiTitle size="xs">
                <h2>{proposal.title}</h2>
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
          <EuiSpacer size="xs" />
          <EuiFlexGroup alignItems="center" gutterSize="s">
            <EuiFlexItem grow={false}>
              <EuiHealth color={severityColor[proposal.severity]}>{proposal.severity}</EuiHealth>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs">{status.label()}</EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup alignItems="center" gutterSize="s">
            <EuiAvatar name="Operator" size="s" />
            <EuiButtonEmpty iconType="panelRight" size="xs">
              Inspector
            </EuiButtonEmpty>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};

const MessageBubble: React.FC<{ message: ThreadMessage }> = ({ message }) => {
  const isUser = message.role === 'user';
  return (
    <div
      className={`daybreakMessage ${isUser ? 'daybreakMessage--user' : 'daybreakMessage--agent'}`}
    >
      <EuiFlexGroup gutterSize="s" alignItems="flexStart">
        {!isUser && (
          <EuiFlexItem grow={false}>
            <EuiAvatar name="NotDaybreak" size="s" color="#1769d3" />
          </EuiFlexItem>
        )}
        <EuiFlexItem>
          <EuiPanel
            className="daybreakMessageBubble"
            paddingSize="s"
            color={isUser ? 'primary' : 'subdued'}
            hasBorder={false}
          >
            <EuiText size="s">{message.text}</EuiText>
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>
  );
};

export const ThreadView: React.FC<ThreadViewProps> = ({ proposal, type }) => {
  const threadType = type ?? deriveThreadType(proposal);
  const [messages, setMessages] = React.useState<ThreadMessage[]>([
    {
      id: 'welcome',
      role: 'agent',
      text: `I found ${proposal.evidenceRefs.length} evidence item(s) for "${proposal.title}". What would you like to do next?`,
      name: 'NotDaybreak',
    },
  ]);
  const [input, setInput] = React.useState('');
  const [starters] = React.useState(defaultStarters);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = (text: string) => {
    if (!text.trim()) return;
    const userMsg: ThreadMessage = { id: `u-${Date.now()}`, role: 'user', text };
    const agentMsg: ThreadMessage = {
      id: `a-${Date.now()}`,
      role: 'agent',
      text: `Acknowledged: "${text}". I will reason about this in the context of ${proposal.title}.`,
      name: 'NotDaybreak',
    };
    setMessages((prev) => [...prev, userMsg, agentMsg]);
    setInput('');
  };

  return (
    <div className="daybreakThreadView" data-test-subj="daybreakThreadView">
      <SpineHeader proposal={proposal} type={threadType} />
      <div className="daybreakStream" ref={scrollRef} data-test-subj="daybreakMessageStream">
        {messages.length === 0 ? (
          <EuiText color="subdued" size="s">
            No messages yet. Start the thread below.
          </EuiText>
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
      </div>
      <div className="daybreakThreadComposer">
        <EuiFlexGroup gutterSize="xs" wrap responsive={false} className="daybreakThreadStarters">
          {starters.map((starter) => (
            <EuiFlexItem key={starter} grow={false}>
              <EuiButtonEmpty size="xs" onClick={() => send(starter)}>
                {starter}
              </EuiButtonEmpty>
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
        <EuiSpacer size="s" />
        <EuiFlexGroup gutterSize="s" responsive={false}>
          <EuiFlexItem>
            <EuiFieldText
              data-test-subj="daybreakThreadComposerInput"
              placeholder="Ask about this record…"
              value={input}
              fullWidth
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  send(input);
                }
              }}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton fill onClick={() => send(input)} data-test-subj="daybreakThreadComposerSend">
              <FormattedMessage id="xpack.daybreak.thread.send" defaultMessage="Send" />
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </div>
    </div>
  );
};
