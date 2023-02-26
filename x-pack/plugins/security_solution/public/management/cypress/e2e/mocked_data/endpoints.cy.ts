/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getEndpointListPath } from '../../../common/routing';
import { login } from '../../tasks/login';
import { runEndpointLoaderScript } from '../../tasks/run_endpoint_loader';

describe('Endpoints page', () => {
  before(() => {
    runEndpointLoaderScript();
  });

  beforeEach(() => {
    login();
  });

  it('Loads the endpoints page', () => {
    cy.visit(getEndpointListPath({ name: 'endpointList' }));
    cy.contains('Hosts running Elastic Defend').should('exist');
  });
});
