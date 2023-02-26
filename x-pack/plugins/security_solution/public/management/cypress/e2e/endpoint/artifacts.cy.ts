/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { recurse } from 'cypress-recurse';
import { APP_ENDPOINTS_PATH } from '../../../../../common/constants';
import { getArtifactsListTestsData } from '../../fixtures/artifacts_page';
import { removeAllArtifacts } from '../../tasks/artifacts';
import { loadEndpointDataForEventFiltersIfNeeded } from '../../tasks/load_endpoint_data';
import { login } from '../../tasks/login';
import { performUserActions } from '../../tasks/perform_user_actions';
import type { MetadataListResponse, HostInfo } from '../../../../../common/endpoint/types';
import { request } from '../../tasks/common';

const yieldInstalledEndpointRevision = (): Cypress.Chainable<
  NonNullable<HostInfo['policy_info']>
> =>
  request<MetadataListResponse>({ method: 'GET', url: '/api/endpoint/metadata' }).then(
    ({ body }) => body.data[0]?.policy_info as NonNullable<HostInfo['policy_info']>
  );

const parseRevNumber = (revString: string) => Number(revString.match(/\d+/)?.[0]);

describe('Artifact pages', () => {
  beforeEach(() => {
    login();
    loadEndpointDataForEventFiltersIfNeeded();
  });

  for (const testData of getArtifactsListTestsData()) {
    after(() => {
      removeAllArtifacts();

      recurse(
        yieldInstalledEndpointRevision,
        (endpointPolicy: HostInfo['policy_info']) =>
          endpointPolicy &&
          endpointPolicy.agent.applied.revision === endpointPolicy.agent.configured.revision,
        { delay: 5000 }
      );
    });

    describe(`${testData.title}`, () => {
      it(`should update Endpoint Policy on Endpoint when adding ${testData.artifactName}`, () => {
        cy.visit(APP_ENDPOINTS_PATH);

        cy.getByTestSubj('policyListRevNo')
          .eq(0)
          .invoke('text')
          .then((initialRevisionNumber) => {
            cy.visit(`/app/security/administration/${testData.urlPath}`);

            cy.getByTestSubj(`${testData.pagePrefix}-emptyState-addButton`).click();
            performUserActions(testData.create.formActions);
            cy.getByTestSubj(`${testData.pagePrefix}-flyout-submitButton`).click();

            //   Check new artifact is in the list
            for (const checkResult of testData.create.checkResults) {
              cy.getByTestSubj(checkResult.selector).should('have.text', checkResult.value);
            }

            cy.visit(APP_ENDPOINTS_PATH);

            // depends on the 10s auto refresh
            cy.getByTestSubj('policyListRevNo')
              .eq(0)
              .should('have.text', `rev. ${parseRevNumber(initialRevisionNumber) + 1}`, {
                timeout: 240000,
              });
          });
      });
    });
  }
});
