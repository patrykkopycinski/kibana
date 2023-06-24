/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom-v5-compat';
import { EuiPageSidebar, EuiSideNav } from '@elastic/eui';

export const Sidebar = () => {
  const navigate = useNavigate();
  return (
    <EuiPageSidebar>
      <EuiSideNav
        items={[
          {
            name: 'Component Sandboxes',
            id: 'component_sandboxes',
            items: [
              {
                id: 'home',
                name: 'Home',
                onClick: () => navigate('/'),
              },
              {
                id: 'rules_list',
                name: 'Rules List',
                onClick: () => navigate(`/rules_list`),
              },
              {
                id: 'rules_list_notify_badge',
                name: 'Rules List Notify Badge',
                onClick: () => navigate(`/rules_list_notify_badge`),
              },
              {
                id: 'rule_tag_badge',
                name: 'Rule Tag Badge',
                onClick: () => navigate(`/rule_tag_badge`),
              },
              {
                id: 'rule_tag_filter',
                name: 'Rule Tag Filter',
                onClick: () => navigate(`/rule_tag_filter`),
              },
              {
                id: 'rule_event_log_list',
                name: 'Run History List',
                onClick: () => navigate(`/rule_event_log_list`),
              },
              {
                id: 'rule_status_dropdown',
                name: 'Rule Status Dropdown',
                onClick: () => navigate(`/rule_status_dropdown`),
              },
              {
                id: 'rule_status_filter',
                name: 'Rule Status Filter',
                onClick: () => navigate(`/rule_status_filter`),
              },
              {
                id: 'alerts table',
                name: 'Alert Table',
                onClick: () => navigate('/alerts_table'),
              },
              {
                id: 'rules settings link',
                name: 'Rules Settings Link',
                onClick: () => navigate('/rules_settings_link'),
              },
            ],
          },
        ]}
      />
    </EuiPageSidebar>
  );
};
