/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { ReactNode } from 'react';
import { ExpandableSection } from '../../../shared/components/expandable_section';
import { useExpandSection } from '../../../shared/hooks/use_expand_section';
import { FLYOUT_STORAGE_KEYS } from '../constants/local_storage';

interface OverviewSectionProps {
  /** Lowercase key the expanded state is stored under. */
  sectionId: string;
  title: string;
  defaultExpanded: boolean;
  'data-test-subj': string;
  extraAction?: ReactNode;
  children: ReactNode;
}

/** One collapsible block of the Overview tab, its state kept in local storage. */
export const OverviewSection = ({
  sectionId,
  title,
  defaultExpanded,
  'data-test-subj': dataTestSubj,
  extraAction,
  children,
}: OverviewSectionProps) => {
  const expanded = useExpandSection({
    storageKey: FLYOUT_STORAGE_KEYS.OVERVIEW_TAB_EXPANDED_SECTIONS,
    title: sectionId,
    defaultValue: defaultExpanded,
  });

  return (
    <ExpandableSection
      data-test-subj={dataTestSubj}
      expanded={expanded}
      gutterSize="none"
      headingLevel="h3"
      localStorageKey={FLYOUT_STORAGE_KEYS.OVERVIEW_TAB_EXPANDED_SECTIONS}
      sectionId={sectionId}
      title={title}
      extraAction={extraAction}
    >
      {children}
    </ExpandableSection>
  );
};
