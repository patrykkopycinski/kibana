/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { NavigateFunction } from 'react-router-dom-v5-compat';

export const goToWatchList = (navigate: NavigateFunction) => {
  navigate({ pathname: `/watches` });
};

export const goToCreateThresholdAlert = (navigate: NavigateFunction) => {
  navigate({ pathname: `/watches/new-watch/threshold` });
};

export const goToCreateAdvancedWatch = (navigate: NavigateFunction) => {
  navigate({ pathname: `/watches/new-watch/json` });
};
