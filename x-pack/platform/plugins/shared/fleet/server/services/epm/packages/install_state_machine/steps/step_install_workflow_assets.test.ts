/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isValidId } from '@kbn/human-readable-id';

import {
  getFleetPackageWorkflowId,
  substituteWorkflowConnectorIds,
} from './step_install_workflow_assets';

describe('getFleetPackageWorkflowId', () => {
  it('normalizes package names with underscores for workflow id validation', () => {
    const workflowId = getFleetPackageWorkflowId({
      pkgName: 'sdlc_intel',
      spaceId: 'default',
      fileName: 'github-catalog-repos.yaml',
    });

    expect(workflowId).toBe('fleet-default-sdlc-intel-github-catalog-repos');
    expect(isValidId(workflowId)).toBe(true);
  });
});

describe('substituteWorkflowConnectorIds', () => {
  const sampleYaml = `
consts:
  orgLogin: REPLACE_WITH_ORG_LOGIN
  githubConnectorId: REPLACE_WITH_GITHUB_CONNECTOR_ID
  slackConnectorId: REPLACE_WITH_SLACK_CONNECTOR_ID
  salesforceConnectorId: REPLACE_WITH_SALESFORCE_CONNECTOR_ID
  caseGithubField: REPLACE_WITH_SALESFORCE_CASE_GITHUB_FIELD
  productAreaField: REPLACE_WITH_SALESFORCE_PRODUCT_AREA_FIELD
  sdhRepoPattern: REPLACE_WITH_SDH_REPO_PATTERN
  sdhLabel: REPLACE_WITH_SDH_LABEL
  gdriveConnectorId: REPLACE_WITH_GDRIVE_CONNECTOR_ID
  roadmapFolderIds: REPLACE_WITH_GDRIVE_ROADMAP_FOLDER_IDS
  aiConnectorId: REPLACE_WITH_AI_CONNECTOR_ID
`;

  it('substitutes connector and org placeholders from package policy vars', () => {
    const result = substituteWorkflowConnectorIds(sampleYaml, {
      github_connector_id: 'github-conn-1',
      slack_connector_id: 'slack-conn-2',
      salesforce_connector_id: 'salesforce-conn-3',
      salesforce_case_github_field: 'Engineering_Issue_URL__c',
      salesforce_product_area_field: 'Product_Area__c',
      sdh_repo_pattern: 'sdh-*',
      sdh_label: 'sdh',
      google_drive_connector_id: 'gdrive-conn-4',
      gdrive_roadmap_folder_ids: ['folder-roadmap-1', 'folder-okrs-2'],
      ai_connector_id: 'ai-conn-5',
      org_login: 'my-org',
    });

    expect(result).toContain('orgLogin: my-org');
    expect(result).toContain('githubConnectorId: github-conn-1');
    expect(result).toContain('slackConnectorId: slack-conn-2');
    expect(result).toContain('salesforceConnectorId: salesforce-conn-3');
    expect(result).toContain('caseGithubField: Engineering_Issue_URL__c');
    expect(result).toContain('productAreaField: Product_Area__c');
    expect(result).toContain('sdhRepoPattern: sdh-*');
    expect(result).toContain('sdhLabel: sdh');
    expect(result).toContain('gdriveConnectorId: gdrive-conn-4');
    expect(result).toContain('roadmapFolderIds: folder-roadmap-1,folder-okrs-2');
    expect(result).toContain('aiConnectorId: ai-conn-5');
    expect(result).not.toContain('REPLACE_WITH_ORG_LOGIN');
    expect(result).not.toContain('REPLACE_WITH_GITHUB_CONNECTOR_ID');
    expect(result).not.toContain('REPLACE_WITH_SLACK_CONNECTOR_ID');
    expect(result).not.toContain('REPLACE_WITH_SALESFORCE_CONNECTOR_ID');
    expect(result).not.toContain('REPLACE_WITH_SALESFORCE_CASE_GITHUB_FIELD');
    expect(result).not.toContain('REPLACE_WITH_SALESFORCE_PRODUCT_AREA_FIELD');
    expect(result).not.toContain('REPLACE_WITH_SDH_REPO_PATTERN');
    expect(result).not.toContain('REPLACE_WITH_SDH_LABEL');
    expect(result).not.toContain('REPLACE_WITH_GDRIVE_CONNECTOR_ID');
    expect(result).not.toContain('REPLACE_WITH_GDRIVE_ROADMAP_FOLDER_IDS');
    expect(result).not.toContain('REPLACE_WITH_AI_CONNECTOR_ID');
  });

  it('substitutes all placeholders byte-identically for the SDLC package', () => {
    const yaml = `
consts:
  orgLogin: REPLACE_WITH_ORG_LOGIN
  githubConnectorId: REPLACE_WITH_GITHUB_CONNECTOR_ID
  slackConnectorId: REPLACE_WITH_SLACK_CONNECTOR_ID
  salesforceConnectorId: REPLACE_WITH_SALESFORCE_CONNECTOR_ID
  caseGithubField: REPLACE_WITH_SALESFORCE_CASE_GITHUB_FIELD
  productAreaField: REPLACE_WITH_SALESFORCE_PRODUCT_AREA_FIELD
  sdhRepoPattern: REPLACE_WITH_SDH_REPO_PATTERN
  sdhLabel: REPLACE_WITH_SDH_LABEL
  gdriveConnectorId: REPLACE_WITH_GDRIVE_CONNECTOR_ID
  roadmapFolderIds: REPLACE_WITH_GDRIVE_ROADMAP_FOLDER_IDS
  aiConnectorId: REPLACE_WITH_AI_CONNECTOR_ID
`;
    const result = substituteWorkflowConnectorIds(yaml, {
      github_connector_id: 'github-conn-1',
      slack_connector_id: 'slack-conn-2',
      salesforce_connector_id: 'salesforce-conn-3',
      salesforce_case_github_field: 'Engineering_Issue_URL__c',
      salesforce_product_area_field: 'Product_Area__c',
      sdh_repo_pattern: 'sdh-*',
      sdh_label: 'sdh',
      google_drive_connector_id: 'gdrive-conn-4',
      gdrive_roadmap_folder_ids: ['folder-roadmap-1', 'folder-okrs-2'],
      ai_connector_id: 'ai-conn-5',
      org_login: 'my-org',
    });

    expect(result).toBe(`
consts:
  orgLogin: my-org
  githubConnectorId: github-conn-1
  slackConnectorId: slack-conn-2
  salesforceConnectorId: salesforce-conn-3
  caseGithubField: Engineering_Issue_URL__c
  productAreaField: Product_Area__c
  sdhRepoPattern: sdh-*
  sdhLabel: sdh
  gdriveConnectorId: gdrive-conn-4
  roadmapFolderIds: folder-roadmap-1,folder-okrs-2
  aiConnectorId: ai-conn-5
`);
  });

  it('substitutes a new var using only the convention', () => {
    const result = substituteWorkflowConnectorIds('jiraConnectorId: REPLACE_WITH_JIRA_CONNECTOR_ID', {
      jira_connector_id: 'jira-conn-1',
    });
    expect(result).toBe('jiraConnectorId: jira-conn-1');
  });

  it('joins multi-value roadmap folder IDs for workflow substitution', () => {
    const result = substituteWorkflowConnectorIds(
      'roadmapFolderIds: REPLACE_WITH_GDRIVE_ROADMAP_FOLDER_IDS',
      {
        gdrive_roadmap_folder_ids: 'folder-a, folder-b',
      }
    );

    expect(result).toContain('roadmapFolderIds: folder-a, folder-b');
  });

  it('trims leading and trailing whitespace from string vars', () => {
    const result = substituteWorkflowConnectorIds('orgLogin: REPLACE_WITH_ORG_LOGIN', {
      org_login: '  my-org  ',
    });
    expect(result).toBe('orgLogin: my-org');
  });

  it('trims whitespace around array elements and joins with commas', () => {
    const result = substituteWorkflowConnectorIds(
      'roadmapFolderIds: REPLACE_WITH_GDRIVE_ROADMAP_FOLDER_IDS',
      {
        gdrive_roadmap_folder_ids: ['  folder-a  ', 'folder-b'],
      }
    );
    expect(result).toBe('roadmapFolderIds: folder-a,folder-b');
  });

  it('drops empty or whitespace-only array elements', () => {
    const result = substituteWorkflowConnectorIds(
      'roadmapFolderIds: REPLACE_WITH_GDRIVE_ROADMAP_FOLDER_IDS',
      {
        gdrive_roadmap_folder_ids: ['folder-a', '', '   ', 'folder-b'],
      }
    );
    expect(result).toBe('roadmapFolderIds: folder-a,folder-b');
  });

  it('leaves placeholder untouched when string var is whitespace-only', () => {
    const result = substituteWorkflowConnectorIds('orgLogin: REPLACE_WITH_ORG_LOGIN', {
      org_login: '   ',
    });
    expect(result).toBe('orgLogin: REPLACE_WITH_ORG_LOGIN');
  });

  it('substitutes the longest matching placeholder even when a shorter one is a prefix', () => {
    const result = substituteWorkflowConnectorIds('orgLogin: REPLACE_WITH_ORG_LOGIN', {
      org: 'SHORT',
      org_login: 'my-org',
    });
    expect(result).toBe('orgLogin: my-org');
  });

  it('is independent of vars insertion order for prefix placeholders', () => {
    const result = substituteWorkflowConnectorIds('orgLogin: REPLACE_WITH_ORG_LOGIN', {
      org_login: 'my-org',
      org: 'SHORT',
    });
    expect(result).toBe('orgLogin: my-org');
  });

  it('leaves placeholders when vars are missing', () => {
    const result = substituteWorkflowConnectorIds(sampleYaml, {});

    expect(result).toContain('REPLACE_WITH_ORG_LOGIN');
    expect(result).toContain('REPLACE_WITH_GITHUB_CONNECTOR_ID');
    expect(result).toContain('REPLACE_WITH_SLACK_CONNECTOR_ID');
    expect(result).toContain('REPLACE_WITH_SALESFORCE_CONNECTOR_ID');
    expect(result).toContain('REPLACE_WITH_SALESFORCE_CASE_GITHUB_FIELD');
    expect(result).toContain('REPLACE_WITH_SALESFORCE_PRODUCT_AREA_FIELD');
    expect(result).toContain('REPLACE_WITH_SDH_REPO_PATTERN');
    expect(result).toContain('REPLACE_WITH_SDH_LABEL');
    expect(result).toContain('REPLACE_WITH_GDRIVE_CONNECTOR_ID');
    expect(result).toContain('REPLACE_WITH_GDRIVE_ROADMAP_FOLDER_IDS');
    expect(result).toContain('REPLACE_WITH_AI_CONNECTOR_ID');
  });
});
