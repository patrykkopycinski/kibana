/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiButton,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type { IconType } from '@elastic/eui';
import { useKibana } from '../hooks/use_kibana';

interface EmbeddedAppPageProps {
  title: string;
  appId: string;
  icon: IconType;
  description: string;
}

export const EmbeddedAppPage: React.FC<EmbeddedAppPageProps> = ({
  title,
  appId,
  icon,
  description,
}) => {
  const { application } = useKibana().services;

  return (
    <section data-test-subj={`daybreakEmbeddedApp-${appId}`}>
      <EuiText className="daybreakEyebrow" size="xs">
        EMBEDDED APP
      </EuiText>
      <EuiSpacer size="s" />
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiIcon type={icon} size="l" />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiTitle size="s">
            <h2>{title}</h2>
          </EuiTitle>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      <EuiPanel hasBorder paddingSize="l">
        <EuiEmptyPrompt
          title={<h3>Open {title}</h3>}
          body={<p>{description}</p>}
          actions={
            <EuiButton
              fill
              onClick={() => application?.navigateToApp?.(appId)}
              data-test-subj={`daybreakOpenApp-${appId}`}
            >
              Go to {title}
            </EuiButton>
          }
        />
      </EuiPanel>
    </section>
  );
};
