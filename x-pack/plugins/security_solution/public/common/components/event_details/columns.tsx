/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

/* eslint-disable react/display-name */

import {
  EuiCheckbox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPanel,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import React from 'react';
import styled from 'styled-components';

import { ToStringArray } from '../../../graphql/types';
import { ColumnHeaderOptions } from '../../../timelines/store/timeline/model';
import { FieldName } from '../../../timelines/components/fields_browser/field_name';
import { SelectableText } from '../selectable_text';
import { OverflowField } from '../tables/helpers';
import { defaultColumnHeaderType } from '../../../timelines/components/timeline/body/column_headers/default_headers';
import { DEFAULT_COLUMN_MIN_WIDTH } from '../../../timelines/components/timeline/body/constants';
import { MESSAGE_FIELD_NAME } from '../../../timelines/components/timeline/body/renderers/constants';
import { FormattedFieldValue } from '../../../timelines/components/timeline/body/renderers/formatted_field';
import { getIconFromType, getExampleText } from './helpers';
import * as i18n from './translations';
import { EventFieldsData } from './types';

const HoverActionsContainer = styled(EuiPanel)`
  align-items: center;
  display: flex;
  flex-direction: row;
  height: 25px;
  justify-content: center;
  left: 5px;
  position: absolute;
  top: -10px;
  width: 30px;
`;

HoverActionsContainer.displayName = 'HoverActionsContainer';

export const getColumns = ({
  columnHeaders,
  eventId,
  contextId,
  toggleColumn,
}: {
  columnHeaders: ColumnHeaderOptions[];
  eventId: string;
  contextId: string;
  toggleColumn: (column: ColumnHeaderOptions) => void;
}) => [
  {
    field: 'field',
    name: '',
    sortable: false,
    truncateText: false,
    width: '30px',
    render: (field: string) => (
      <EuiToolTip content={i18n.TOGGLE_COLUMN_TOOLTIP}>
        <EuiCheckbox
          checked={columnHeaders.findIndex((c) => c.id === field) !== -1}
          data-test-subj={`toggle-field-${field}`}
          id={field}
          onChange={() =>
            toggleColumn({
              columnHeaderType: defaultColumnHeaderType,
              id: field,
              width: DEFAULT_COLUMN_MIN_WIDTH,
            })
          }
        />
      </EuiToolTip>
    ),
  },
  {
    field: 'field',
    name: i18n.FIELD,
    sortable: true,
    truncateText: false,
    render: (field: string, data: EventFieldsData) => (
      <EuiFlexGroup alignItems="center" gutterSize="none">
        <EuiFlexItem grow={false}>
          <EuiToolTip content={data.type}>
            <EuiIcon data-test-subj="field-type-icon" type={getIconFromType(data.type)} />
          </EuiToolTip>
        </EuiFlexItem>

        <EuiFlexItem grow={false}>
          <FieldName data-test-subj="field-name" fieldId={field} />
        </EuiFlexItem>
      </EuiFlexGroup>
    ),
  },
  {
    field: 'values',
    name: i18n.VALUE,
    sortable: true,
    truncateText: false,
    render: (values: ToStringArray | null | undefined, data: EventFieldsData) => (
      <EuiFlexGroup direction="column" alignItems="flexStart" component="span" gutterSize="none">
        {values != null &&
          values.map((value, i) => (
            <EuiFlexItem
              grow={false}
              component="span"
              key={`event-details-value-flex-item-${contextId}-${eventId}-${data.field}-${i}-${value}`}
            >
              {data.field === MESSAGE_FIELD_NAME ? (
                <OverflowField value={value} />
              ) : (
                <FormattedFieldValue
                  contextId={`event-details-value-formatted-field-value-${contextId}-${eventId}-${data.field}-${i}-${value}`}
                  eventId={eventId}
                  fieldFormat={data.format}
                  fieldName={data.field}
                  fieldType={data.type}
                  value={value}
                />
              )}
            </EuiFlexItem>
          ))}
      </EuiFlexGroup>
    ),
  },
  {
    field: 'description',
    name: i18n.DESCRIPTION,
    render: (description: string | null | undefined, data: EventFieldsData) => (
      <SelectableText>
        <EuiText size="xs">{`${description || ''} ${getExampleText(data.example)}`}</EuiText>
      </SelectableText>
    ),
    sortable: true,
    truncateText: true,
    width: '50%',
  },
  {
    field: 'valuesConcatenated',
    name: i18n.BLANK,
    render: () => null,
    sortable: false,
    truncateText: true,
    width: '1px',
  },
];
