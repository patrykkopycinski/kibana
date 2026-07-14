/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiIcon } from '@elastic/eui';
import type { DaybreakWatch } from '../../services/watches_service';
import type { DaybreakWatchAutonomyTier } from '../../services/watches_service';

export const watchAccentColor = (watch: DaybreakWatch): string => {
  const key = `${watch.id} ${watch.name}`.toLowerCase();
  if (key.includes('floor')) return 'var(--teal)';
  if (key.includes('officer')) return 'var(--blue)';
  if (key.includes('dark')) return 'var(--amber)';
  if (key.includes('deep')) return 'var(--violet)';
  return 'var(--accent)';
};

const AUTONOMY_LEVEL: Record<DaybreakWatchAutonomyTier, number> = {
  'proposed-diff': 2,
  'auto-run': 3,
  'approval-required': 4,
};

export const AutonomyMeter: React.FC<{ tier: DaybreakWatchAutonomyTier }> = ({ tier }) => {
  const level = AUTONOMY_LEVEL[tier];
  return (
    <span className="daybreakAutMeter" aria-label={`Autonomy level ${level} of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <i key={i} className={i < level ? 'on' : ''} />
      ))}
    </span>
  );
};

export const AgentsSectionHeader: React.FC<{
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}> = ({ title, subtitle, actions }) => (
  <div className="ctl-sech">
    <h3>{title}</h3>
    {subtitle ? <span className="ctl-count">{subtitle}</span> : null}
    {actions ? <div className="ctl-sech-actions">{actions}</div> : null}
  </div>
);

export const AgentsPagePad: React.FC<{
  children: React.ReactNode;
  testSubj?: string;
}> = ({ children, testSubj }) => (
  <div className="daybreakAgentsPage page-pad" data-test-subj={testSubj}>
    {children}
  </div>
);

export const PipelineArrow: React.FC = () => (
  <span className="ap-arrow" aria-hidden="true">
    <EuiIcon type="arrowRight" size="s" />
  </span>
);
