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
  /** When false the section is not remembered in local storage and always starts as `defaultExpanded`. */
  persist?: boolean;
  children: ReactNode;
}

/** One collapsible block of the Overview tab, its state kept in local storage. */
export const OverviewSection = ({
  sectionId,
  title,
  defaultExpanded,
  'data-test-subj': dataTestSubj,
  extraAction,
  persist = true,
  children,
}: OverviewSectionProps) => {
  const storedExpanded = useExpandSection({
    storageKey: FLYOUT_STORAGE_KEYS.OVERVIEW_TAB_EXPANDED_SECTIONS,
    title: sectionId,
    defaultValue: defaultExpanded,
  });
  const expanded = persist ? storedExpanded : defaultExpanded;

  return (
    <ExpandableSection
      data-test-subj={dataTestSubj}
      expanded={expanded}
      gutterSize="none"
      headingLevel="h3"
      localStorageKey={persist ? FLYOUT_STORAGE_KEYS.OVERVIEW_TAB_EXPANDED_SECTIONS : undefined}
      sectionId={sectionId}
      title={title}
      extraAction={extraAction}
    >
      {children}
    </ExpandableSection>
  );
};
