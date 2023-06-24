/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { Navigate } from 'react-router-dom-v5-compat';
import { Routes, Route } from '@kbn/shared-ux-router';

import { RedirectToLogs } from './redirect_to_logs';
import { RedirectToNodeLogs } from './redirect_to_node_logs';
import { inventoryModels } from '../../../common/inventory_models';

const ITEM_TYPES = inventoryModels.map((m) => m.id).join('|');

/**
 * @deprecated Link-to routes shouldn't be used anymore
 * Instead please use locators registered for the infra plugin
 * LogsLocator & NodeLogsLocator
 */
export const LinkToLogsPage: React.FC = (props) => {
  return (
    <Routes>
      <Route
        path={`:logViewId?/:nodeType(${ITEM_TYPES})-logs/:nodeId`}
        element={<RedirectToNodeLogs />}
      />
      <Route path={`:logViewId?/logs`} element={<RedirectToLogs />} />
      <Route path={`:logViewId?`} element={<RedirectToLogs />} />
      <Route element={<Navigate to="/" replace />} />
    </Routes>
  );
};
