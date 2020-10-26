/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { shallow } from 'enzyme';
import React from 'react';
import { DraggableStateSnapshot, DraggingStyle } from 'react-beautiful-dnd';
import { waitFor } from '@testing-library/react';
import '../../mock/match_media';
import { mockBrowserFields } from '../../containers/source/mock';
import { TestProviders } from '../../mock';
import { mockDataProviders } from '../../../timelines/components/timeline/data_providers/mock/mock_data_providers';
import { DragDropContextWrapper } from './drag_drop_context_wrapper';
import { ConditionalPortal, DraggableWrapper, getStyle } from './draggable_wrapper';
import { useMountAppended } from '../../utils/use_mount_appended';

describe('DraggableWrapper', () => {
  const dataProvider = mockDataProviders[0];
  const message = 'draggable wrapper content';
  const mount = useMountAppended();

  beforeEach(() => {
    jest.useFakeTimers();
  });

  describe('rendering', () => {
    test('it renders against the snapshot', () => {
      const wrapper = shallow(
        <TestProviders>
          <DragDropContextWrapper browserFields={mockBrowserFields}>
            <DraggableWrapper dataProvider={dataProvider}>{message}</DraggableWrapper>
          </DragDropContextWrapper>
        </TestProviders>
      );

      expect(wrapper.find('DraggableWrapper')).toMatchSnapshot();
    });

    test('it renders the children passed to the render prop', () => {
      const wrapper = mount(
        <TestProviders>
          <DragDropContextWrapper browserFields={mockBrowserFields}>
            <DraggableWrapper dataProvider={dataProvider}>{message}</DraggableWrapper>
          </DragDropContextWrapper>
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(message);
    });

    test('it does NOT render hover actions when the mouse is NOT over the draggable wrapper', () => {
      const wrapper = mount(
        <TestProviders>
          <DragDropContextWrapper browserFields={mockBrowserFields}>
            <DraggableWrapper dataProvider={dataProvider}>{message}</DraggableWrapper>
          </DragDropContextWrapper>
        </TestProviders>
      );

      expect(wrapper.find('[data-test-subj="copy-to-clipboard"]').exists()).toBe(false);
    });

    test('it renders hover actions when the mouse is over the text of draggable wrapper', async () => {
      const wrapper = mount(
        <TestProviders>
          <DragDropContextWrapper browserFields={mockBrowserFields}>
            <DraggableWrapper dataProvider={dataProvider}>{message}</DraggableWrapper>
          </DragDropContextWrapper>
        </TestProviders>
      );

      await waitFor(() => {
        wrapper.find('[data-test-subj="withHoverActionsButton"]').simulate('mouseenter');
        wrapper.update();
        jest.runAllTimers();
        wrapper.update();
        expect(wrapper.find('[data-test-subj="copy-to-clipboard"]').exists()).toBe(true);
      });
    });
  });

  describe('text truncation styling', () => {
    test('it applies text truncation styling when truncate IS specified (implicit: and the user is not dragging)', () => {
      const wrapper = mount(
        <TestProviders>
          <DragDropContextWrapper browserFields={mockBrowserFields}>
            <DraggableWrapper dataProvider={dataProvider} truncate>
              {message}
            </DraggableWrapper>
          </DragDropContextWrapper>
        </TestProviders>
      );

      expect(wrapper.find('[data-test-subj="draggable-truncatable-content"]').exists()).toEqual(
        true
      );
    });

    test('it does NOT apply text truncation styling when truncate is NOT specified', () => {
      const wrapper = mount(
        <TestProviders>
          <DragDropContextWrapper browserFields={mockBrowserFields}>
            <DraggableWrapper dataProvider={dataProvider}>{message}</DraggableWrapper>
          </DragDropContextWrapper>
        </TestProviders>
      );

      expect(wrapper.find('[data-test-subj="draggable-truncatable-content"]').exists()).toEqual(
        false
      );
    });
  });
});
