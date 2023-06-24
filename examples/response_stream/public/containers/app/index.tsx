/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import React from 'react';
import { Navigate } from 'react-router-dom-v5-compat';
import { BrowserRouter as Router, Routes, Route } from '@kbn/shared-ux-router';
import { EuiPage } from '@elastic/eui';
import { useDeps } from '../../hooks/use_deps';
import { Sidebar } from './sidebar';
import { routes } from '../../routes';

export const App: React.FC = () => {
  const { appBasePath } = useDeps();

  const routeElements: React.ReactElement[] = [];
  for (const { items } of routes) {
    for (const { id, component } of items) {
      routeElements.push(<Route key={id} path={`/${id}`} element={component} />);
    }
  }

  return (
    <Router basename={appBasePath}>
      <EuiPage>
        <Sidebar />
        <Routes>
          {routeElements}
          <Route index element={<Navigate to="/simple-string-stream" replace />} />
        </Routes>
      </EuiPage>
    </Router>
  );
};
