/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiButtonIcon, EuiFlexGroup, EuiFlexItem, EuiIcon, EuiToolTip } from '@elastic/eui';
import type { IconType } from '@elastic/eui';

export type DaybreakDest =
  | 'home'
  | 'discover'
  | 'dashboards'
  | 'alerts'
  | 'discoveries'
  | 'records'
  | 'hunt'
  | 'streams'
  | 'agents'
  | 'skills'
  | 'workflows'
  | 'activity'
  | 'guardrails'
  | 'more';
export type HomeNavView = 'brief' | 'chats' | 'projects' | 'templates';

export interface RailItem {
  key: DaybreakDest | HomeNavView;
  label: string;
  icon: IconType;
  group?: 'operate' | 'agent' | 'home';
  onClick: () => void;
  isActive?: boolean;
  isSolution?: boolean;
}

export interface RailAppDef {
  key: DaybreakDest;
  label: string;
  icon: IconType;
  group?: 'operate' | 'agent' | 'home';
}

export interface DaybreakRailProps {
  dest: DaybreakDest;
  navView: HomeNavView;
  onGoBrief: () => void;
  onGoChats: () => void;
  onGo: (dest: DaybreakDest) => void;
  onOpenNavPrefs?: () => void;
}

const SOLUTION_ICON: IconType = 'sun';
const CHATS_ICON: IconType = 'editorComment';
const MORE_ICON: IconType = 'boxesHorizontal';

const OPERATE_APPS: RailAppDef[] = [
  { key: 'discover', label: 'Discover', icon: 'compass' },
  { key: 'dashboards', label: 'Dashboards', icon: 'dashboardApp' },
  { key: 'alerts', label: 'Alerts', icon: 'bell' },
  { key: 'discoveries', label: 'Attacks', icon: 'bug' },
  { key: 'records', label: 'Records', icon: 'notebookApp' },
  { key: 'hunt', label: 'Threat hunt', icon: 'target' },
  { key: 'streams', label: 'Streams', icon: 'logstashInput' },
];

const AGENT_APPS: RailAppDef[] = [
  { key: 'agents', label: 'Watches', icon: 'eye' },
  { key: 'workflows', label: 'Workflows', icon: 'play' },
  { key: 'skills', label: 'Skills', icon: 'layers' },
  { key: 'activity', label: 'Activity', icon: 'pulse' },
  { key: 'guardrails', label: 'Guardrails', icon: 'security' },
];

export const DaybreakRail: React.FC<DaybreakRailProps> = ({
  dest,
  navView,
  onGoBrief,
  onGoChats,
  onGo,
  onOpenNavPrefs,
}) => {
  const homeAppItems: RailItem[] = [
    {
      key: 'brief',
      label: 'Brief',
      icon: SOLUTION_ICON,
      group: 'home',
      onClick: onGoBrief,
      isActive: dest === 'home' && navView === 'brief',
      isSolution: true,
    },
    {
      key: 'chats',
      label: 'Chats',
      icon: CHATS_ICON,
      group: 'home',
      onClick: onGoChats,
      isActive: dest === 'home' && navView !== 'brief',
    },
  ];

  const appItems: RailItem[] = [...OPERATE_APPS, ...AGENT_APPS].map((app) => ({
    ...app,
    onClick: () => onGo(app.key),
    isActive: dest === app.key,
  }));

  const renderItem = (item: RailItem) => {
    const activeClass = item.isActive ? 'daybreakRailItem--active' : '';
    const solutionClass = item.isSolution ? 'daybreakRailItem--solution' : '';
    return (
      <EuiToolTip key={item.key} content={item.label} position="right">
        <button
          className={`daybreakRailItem ${activeClass} ${solutionClass}`}
          onClick={item.onClick}
          data-test-subj={`daybreakRailItem-${item.key}`}
          aria-label={item.label}
        >
          <EuiIcon type={item.icon} size="m" />
          <span className="daybreakRailItemLabel">{item.label}</span>
        </button>
      </EuiToolTip>
    );
  };

  return (
    <nav className="daybreakRail" data-test-subj="daybreakRail">
      <EuiFlexGroup
        direction="column"
        justifyContent="spaceBetween"
        gutterSize="none"
        style={{ height: '100%' }}
      >
        <EuiFlexItem grow={false}>
          <EuiFlexGroup direction="column" gutterSize="xs">
            {homeAppItems.map(renderItem)}
            <EuiFlexItem grow={false}>
              <div className="daybreakRailSeparator" />
            </EuiFlexItem>
            {appItems.map(renderItem)}
            <EuiFlexItem grow={false}>
              <div className="daybreakRailSeparator" />
            </EuiFlexItem>
            {renderItem({
              key: 'more',
              label: 'More',
              icon: MORE_ICON,
              onClick: onOpenNavPrefs ?? (() => {}),
              isActive: false,
            })}
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup direction="column" gutterSize="xs">
            <EuiToolTip content="Settings" position="right" disableScreenReaderOutput>
              <EuiButtonIcon
                iconType="gear"
                aria-label="Settings"
                className="daybreakRailFooterButton"
                data-test-subj="daybreakRailSettings"
              />
            </EuiToolTip>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </nav>
  );
};
