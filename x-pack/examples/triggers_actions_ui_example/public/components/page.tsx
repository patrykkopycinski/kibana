/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom-v5-compat';

import {
  EuiPageContent_Deprecated as EuiPageContent,
  EuiPageContentBody_Deprecated as EuiPageContentBody,
  EuiPageBody,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiTitle,
  EuiBreadcrumbs,
  EuiSpacer,
} from '@elastic/eui';

interface PageProps {
  title: string;
  crumb?: string;
  isHome?: boolean;
}

export const Page: React.FC<PageProps> = (props) => {
  const { title, crumb, isHome, children } = props;

  const navigate = useNavigate();

  const breadcrumbs: Array<{
    text: string;
    onClick?: () => void;
  }> = [
    {
      text: crumb ?? title,
    },
  ];
  if (!isHome) {
    breadcrumbs.splice(0, 0, {
      text: 'Home',
      onClick: () => {
        navigate(`/`);
      },
    });
  }

  return (
    <EuiPageBody>
      <EuiPageHeader>
        <EuiPageHeaderSection>
          <EuiTitle size="l">
            <h1>{title}</h1>
          </EuiTitle>
        </EuiPageHeaderSection>
      </EuiPageHeader>
      <EuiBreadcrumbs responsive={false} breadcrumbs={breadcrumbs} />
      <EuiSpacer />
      <EuiPageContent>
        <EuiPageContentBody>{children}</EuiPageContentBody>
      </EuiPageContent>
    </EuiPageBody>
  );
};
