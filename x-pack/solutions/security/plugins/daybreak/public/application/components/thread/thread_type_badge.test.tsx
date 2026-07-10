/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { ThreadTypeBadge } from './thread_type_badge';
import { THREAD_TYPES, THREAD_TYPE_META } from './thread_type';

const renderBadge = (type: (typeof THREAD_TYPES)[number]) =>
  render(
    <IntlProvider locale="en">
      <ThreadTypeBadge type={type} />
    </IntlProvider>
  );

describe('ThreadTypeBadge (FR-013)', () => {
  it('renders a badge with the type-scoped test subject and label for every thread type', () => {
    for (const type of THREAD_TYPES) {
      const { unmount } = renderBadge(type);

      expect(screen.getByTestId(`daybreakThreadTypeBadge-${type}`)).toBeInTheDocument();
      expect(screen.getByText(THREAD_TYPE_META[type].label())).toBeInTheDocument();

      unmount();
    }
  });
});
