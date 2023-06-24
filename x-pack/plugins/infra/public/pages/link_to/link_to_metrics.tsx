/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { Navigate } from 'react-router-dom-v5-compat';
import { Routes, Route } from '@kbn/shared-ux-router';

import { RedirectToNodeDetail } from './redirect_to_node_detail';
import { RedirectToHostDetailViaIP } from './redirect_to_host_detail_via_ip';
import { RedirectToInventory } from './redirect_to_inventory';
import { inventoryModels } from '../../../common/inventory_models';

const ITEM_TYPES = inventoryModels.map((m) => m.id).join('|');

export const LinkToMetricsPage: React.FC = () => {
  return (
    <Routes>
      <Route path={`:nodeType(${ITEM_TYPES})-detail/:nodeId`} component={RedirectToNodeDetail} />
      <Route path={`host-detail-via-ip/:hostIp`} component={RedirectToHostDetailViaIP} />
      <Route path={`inventory`} component={RedirectToInventory} />
      <Route index element={<Navigate to="/" replace />} />
    </Routes>
  );
};
