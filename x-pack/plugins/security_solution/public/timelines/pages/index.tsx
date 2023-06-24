/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom-v5-compat';
import { Routes, Route } from '@kbn/shared-ux-router';

import { TimelineType } from '../../../common/types/timeline/api';

import { TimelinesPage } from './timelines_page';

import { appendSearch } from '../../common/components/link_to/helpers';

import { TIMELINES_PATH } from '../../../common/constants';

const timelinesPagePath = `${TIMELINES_PATH}/:tabName(${TimelineType.default}|${TimelineType.template})`;
const timelinesDefaultPath = `${TIMELINES_PATH}/${TimelineType.default}`;

const TimelinesRedirect = React.memo(() => {
  const { search = '' } = useLocation();

  return <Navigate to={`${timelinesDefaultPath}${appendSearch(search)}`} replace />;
});

TimelinesRedirect.displayName = 'TimelinesRedirect';

export const Timelines = React.memo(() => (
  <Routes legacySwitch={false}>
    <Route path={timelinesPagePath} element={<TimelinesPage />} />
    <Route index element={<TimelinesRedirect />} />
  </Routes>
));

Timelines.displayName = 'Timelines';
