/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiBadge,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { useWatches } from '../hooks/use_watches';

export const SkillsConsole: React.FC = () => {
  const { watches, isLoading } = useWatches();
  const skills = React.useMemo(
    () => Array.from(new Set(watches.flatMap((watch) => watch.skillIds))).sort(),
    [watches]
  );

  if (isLoading) return <EuiLoadingSpinner size="m" />;

  return (
    <section data-test-subj="daybreakSkillsConsole">
      <EuiText className="daybreakEyebrow" size="xs">
        AGENT SKILLS
      </EuiText>
      <EuiSpacer size="s" />
      <EuiTitle size="s">
        <h2>Skills in use</h2>
      </EuiTitle>
      <EuiSpacer size="m" />
      {skills.length === 0 ? (
        <EuiEmptyPrompt
          title={<h3>No skills configured</h3>}
          body={<p>Assign skills to Watches in the Watches console to see them here.</p>}
        />
      ) : (
        <EuiFlexGroup direction="column" gutterSize="s" data-test-subj="daybreakSkillsList">
          {skills.map((skill) => (
            <EuiFlexItem key={skill} grow={false}>
              <EuiPanel hasBorder paddingSize="s">
                <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                  <EuiFlexItem>
                    <EuiText size="s">
                      <strong>{skill}</strong>
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiBadge color="hollow">
                      {watches.filter((watch) => watch.skillIds.includes(skill)).length} watch
                      {watches.filter((watch) => watch.skillIds.includes(skill)).length === 1
                        ? ''
                        : 'es'}
                    </EuiBadge>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiPanel>
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
      )}
    </section>
  );
};
