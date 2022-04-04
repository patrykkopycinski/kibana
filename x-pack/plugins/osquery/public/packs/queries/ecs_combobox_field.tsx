/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { find } from 'lodash';
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiComboBox,
  EuiComboBoxOptionOption,
  EuiComboBoxProps,
} from '@elastic/eui';
import styled from 'styled-components';
import { FieldIcon } from '../../common/lib/kibana';
import { FieldHook, getFieldValidityAndErrorMessage, useForm } from '../../shared_imports';
import { ECSSchemaOptions, ECSSchemaOption } from './utils';

const singleSelection = { asPlainText: true };

const typeMap = {
  binary: 'binary',
  half_float: 'number',
  scaled_float: 'number',
  float: 'number',
  integer: 'number',
  long: 'number',
  short: 'number',
  byte: 'number',
  text: 'string',
  keyword: 'string',
  '': 'string',
  geo_point: 'geo_point',
  date: 'date',
  ip: 'ip',
  boolean: 'boolean',
  constant_keyword: 'string',
};

const StyledFieldSpan = styled.span`
  padding-top: 0 !important;
  padding-bottom: 0 !important;
`;

const StyledFieldIcon = styled(FieldIcon)`
  width: 32px;
  > svg {
    padding: 0 6px !important;
  }
`;

interface ECSComboboxFieldProps {
  field: FieldHook<string>;
  euiFieldProps: EuiComboBoxProps<ECSSchemaOption>;
  idAria?: string;
}

const ECSComboboxFieldComponent: React.FC<ECSComboboxFieldProps> = ({
  field,
  euiFieldProps = {},
  idAria,
}) => {
  const { form } = useForm();
  console.error(
    'fiedd',
    field,
    form.getFields(),
    form.getFormData(),
    form.__getFormDefaultValue(),
    form.getFieldDefaultValue('ecs_mapping')
  );
  form.__updateDefaultValueAt('ecs_mapping', [
    {
      key: 'client.address',
      result: {
        type: 'field',
        value: 'minutes',
      },
    },
  ]);
  const { setValue } = field;
  const [selectedOptions, setSelected] = useState<Array<EuiComboBoxOptionOption<ECSSchemaOption>>>(
    []
  );
  const { isInvalid, errorMessage } = getFieldValidityAndErrorMessage(field);
  const describedByIds = useMemo(() => (idAria ? [idAria] : []), [idAria]);

  const handleChange = useCallback(
    (newSelectedOptions) => {
      setSelected(newSelectedOptions);
      setValue(newSelectedOptions[0]?.label ?? '');
    },
    [setSelected, setValue]
  );

  // TODO: Create own component for this.
  const renderOption = useCallback(
    (option, searchValue, contentClassName) => (
      <EuiFlexGroup
        className={`${contentClassName} euiSuggestItem`}
        alignItems="center"
        gutterSize="xs"
      >
        <EuiFlexItem grow={false}>
          {
            // @ts-expect-error update types
            <FieldIcon type={typeMap[option.value.type] ?? option.value.type} />
          }
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <StyledFieldSpan className="euiSuggestItem__label euiSuggestItem__labelDisplay--expand">
            {option.value.field}
          </StyledFieldSpan>
        </EuiFlexItem>

        <EuiFlexItem grow={false}>
          <span className="euiSuggestItem__description euiSuggestItem__description--truncate">
            {option.value.description}
          </span>
        </EuiFlexItem>
      </EuiFlexGroup>
    ),
    []
  );

  const prepend = useMemo(
    () => (
      <StyledFieldIcon
        size="l"
        type={
          // @ts-expect-error update types
          typeMap[selectedOptions[0]?.value?.type] ?? selectedOptions[0]?.value?.type
        }
      />
    ),
    [selectedOptions]
  );

  const helpText = useMemo(() => {
    // @ts-expect-error update types
    let text = selectedOptions[0]?.value?.description;

    if (!text) return;

    // @ts-expect-error update types
    const example = selectedOptions[0]?.value?.example;
    if (example) {
      text += ` e.g. ${JSON.stringify(example)}`;
    }

    return text;
  }, [selectedOptions]);

  useEffect(() => {
    // @ts-expect-error update types
    setSelected(() => {
      if (!field.value.length) return [];

      const selectedOption = find(ECSSchemaOptions, ['label', field.value]);

      return selectedOption ? [selectedOption] : [];
    });
  }, [field]);

  return (
    <EuiFormRow
      label={field.label}
      helpText={helpText}
      error={errorMessage}
      isInvalid={isInvalid}
      fullWidth
      describedByIds={describedByIds}
      isDisabled={euiFieldProps.isDisabled}
    >
      <EuiComboBox
        prepend={prepend}
        fullWidth
        singleSelection={singleSelection}
        // @ts-expect-error update types
        options={ECSSchemaOptions}
        selectedOptions={selectedOptions}
        onChange={handleChange}
        data-test-subj="ECS-field-input"
        renderOption={renderOption}
        rowHeight={32}
        isClearable
        {...euiFieldProps}
      />
    </EuiFormRow>
  );
};

export const ECSComboboxField = React.memo(ECSComboboxFieldComponent);
