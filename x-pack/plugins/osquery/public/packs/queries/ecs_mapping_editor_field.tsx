/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  castArray,
  each,
  isEmpty,
  find,
  orderBy,
  sortedUniqBy,
  isArray,
  reduce,
  trim,
  get,
  map,
  filter,
} from 'lodash';
import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  EuiButton,
  EuiFormLabel,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiComboBox,
  EuiComboBoxProps,
  EuiComboBoxOptionOption,
  EuiSpacer,
  EuiTitle,
  EuiText,
  EuiIcon,
  EuiSuperSelect,
} from '@elastic/eui';
import sqlParser from 'js-sql-parser';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import styled from 'styled-components';
import deepEqual from 'fast-deep-equal';

import osquerySchema from '../../common/schemas/osquery/v5.2.2.json';

import {
  FormArrayField,
  ArrayItem,
  FieldHook,
  getFieldValidityAndErrorMessage,
  useFormData,
  Field,
  TextField,
  getUseField,
  fieldValidators,
  ValidationFuncArg,
  UseMultiFields,
  UseArray,
  useFormContext,
  UseField,
} from '../../shared_imports';
import { OsqueryIcon } from '../../components/osquery_icon';
import { ECSComboboxField } from './ecs_combobox_field';
import { ECSSchemaOptions } from './utils';
import { useSavedQueries } from '../../saved_queries';

export const CommonUseField = getUseField({ component: Field });

const StyledEuiSuperSelect = styled(EuiSuperSelect)`
  min-width: 70px;
  border-radius: 6px 0 0 6px;

  .euiIcon {
    padding: 0;
    width: 18px;
    background: none;
  }
`;

// @ts-expect-error update types
const ResultComboBox = styled(EuiComboBox)`
  &.euiComboBox {
    position: relative;
    left: -1px;

    .euiComboBox__inputWrap {
      border-radius: 0 6px 6px 0;
    }
  }
`;

const StyledFieldSpan = styled.span`
  padding-top: 0 !important;
  padding-bottom: 0 !important;
`;

const DescriptionWrapper = styled(EuiFlexItem)`
  overflow: hidden;
`;

// align the icon to the inputs
const StyledSemicolonWrapper = styled.div`
  margin-top: 8px;
`;

// align the icon to the inputs
const StyledButtonWrapper = styled.div`
  margin-top: 11px;
  width: 24px;
`;

const ECSFieldWrapper = styled(EuiFlexItem)`
  max-width: 100%;
`;

const OSQUERY_COLUMN_VALUE_TYPE_OPTIONS = [
  {
    value: 'field',
    inputDisplay: <OsqueryIcon size="m" />,
    dropdownDisplay: (
      <EuiFlexGroup gutterSize="xs" alignItems="center" justifyContent="center">
        <EuiFlexItem grow={false}>
          <OsqueryIcon size="m" />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText size="s" className="eui-textNoWrap">
            <FormattedMessage
              id="xpack.osquery.pack.form.ecsMappingSection.osqueryValueOptionLabel"
              defaultMessage="Osquery value"
            />
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    ),
  },
  {
    value: 'value',
    inputDisplay: <EuiIcon type="user" size="m" />,
    dropdownDisplay: (
      <EuiFlexGroup gutterSize="xs" alignItems="center" justifyContent="center">
        <EuiFlexItem grow={false}>
          <EuiIcon type="user" size="m" />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText size="s" className="eui-textNoWrap">
            <FormattedMessage
              id="xpack.osquery.pack.form.ecsMappingSection.staticValueOptionLabel"
              defaultMessage="Static value"
            />
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    ),
  },
];

const EMPTY_ARRAY: EuiComboBoxOptionOption[] = [];

interface OsqueryColumnFieldProps {
  resultType: FieldHook<string>;
  resultValue: FieldHook<string | string[]>;
  euiFieldProps: EuiComboBoxProps<OsquerySchemaOption>;
  idAria?: string;
}

const OsqueryColumnFieldComponent: React.FC<OsqueryColumnFieldProps> = ({
  resultType,
  resultValue,
  euiFieldProps = {},
  idAria,
}) => {
  const inputRef = useRef<HTMLInputElement>();
  const { setValue } = resultValue;
  const { setValue: setType } = resultType;
  const { isInvalid, errorMessage } = getFieldValidityAndErrorMessage(resultValue);
  const describedByIds = useMemo(() => (idAria ? [idAria] : []), [idAria]);
  const [selectedOptions, setSelected] = useState<
    Array<EuiComboBoxOptionOption<OsquerySchemaOption>>
  >([]);

  const renderOsqueryOption = useCallback(
    (option, searchValue, contentClassName) => (
      <EuiFlexGroup
        className={`${contentClassName} euiSuggestItem euiSuggestItem--truncate`}
        alignItems="center"
        gutterSize="none"
      >
        <EuiFlexItem grow={false}>
          <StyledFieldSpan className="euiSuggestItem__label euiSuggestItem__labelDisplay--expand">
            {option.value.suggestion_label}
          </StyledFieldSpan>
        </EuiFlexItem>

        <EuiFlexItem grow={false}>
          <StyledFieldSpan className="euiSuggestItem__description euiSuggestItem__description--truncate">
            {option.value.description}
          </StyledFieldSpan>
        </EuiFlexItem>
      </EuiFlexGroup>
    ),
    []
  );

  const handleChange = useCallback(
    (newSelectedOptions) => {
      setSelected(newSelectedOptions);
      setValue(
        isArray(newSelectedOptions)
          ? map(newSelectedOptions, 'label')
          : newSelectedOptions[0]?.label ?? ''
      );
    },
    [setValue, setSelected]
  );

  const onTypeChange = useCallback(
    (newType) => {
      if (newType !== resultType.value) {
        setType(newType);
        setValue(newType === 'value' && euiFieldProps.singleSelection === false ? [] : '');
      }
    },
    [resultType.value, setType, setValue, euiFieldProps.singleSelection]
  );

  const handleCreateOption = useCallback(
    (newOption: string) => {
      const trimmedNewOption = trim(newOption);

      if (!trimmedNewOption.length) return;

      if (euiFieldProps.singleSelection === false) {
        setValue([trimmedNewOption]);
        if (resultValue.value.length) {
          setValue([...castArray(resultValue.value), trimmedNewOption]);
        } else {
          setValue([trimmedNewOption]);
        }
        inputRef.current?.blur();
      } else {
        setValue(trimmedNewOption);
      }
    },
    [euiFieldProps.singleSelection, resultValue.value, setValue]
  );

  const Prepend = useMemo(
    () => (
      <StyledEuiSuperSelect
        options={OSQUERY_COLUMN_VALUE_TYPE_OPTIONS}
        valueOfSelected={resultType.value}
        // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
        popoverProps={{
          panelStyle: {
            minWidth: '250px',
          },
        }}
        onChange={onTypeChange}
      />
    ),
    [onTypeChange, resultType.value]
  );

  useEffect(() => {
    if (euiFieldProps?.singleSelection && isArray(resultValue.value)) {
      setValue(resultValue.value.join(' '));
    }

    if (!euiFieldProps?.singleSelection && !isArray(resultValue.value)) {
      setValue(resultValue.value.length ? [resultValue.value] : []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [euiFieldProps?.singleSelection, setValue]);

  useEffect(() => {
    setSelected(() => {
      if (!resultValue.value.length) return [];

      // Static array values
      if (isArray(resultValue.value)) {
        return resultValue.value.map((value) => ({ label: value }));
      }

      const selectedOption = find(euiFieldProps?.options, ['label', resultValue.value]);

      return selectedOption ? [selectedOption] : [{ label: resultValue.value }];
    });
  }, [euiFieldProps?.options, setSelected, resultValue.value]);

  return (
    <EuiFormRow
      // @ts-expect-error update types
      helpText={selectedOptions[0]?.value?.description}
      error={errorMessage}
      isInvalid={isInvalid}
      fullWidth
      describedByIds={describedByIds}
      isDisabled={euiFieldProps.isDisabled}
    >
      <EuiFlexGroup gutterSize="none">
        <EuiFlexItem grow={false}>{Prepend}</EuiFlexItem>
        <EuiFlexItem>
          <ResultComboBox
            // eslint-disable-next-line react/jsx-no-bind, react-perf/jsx-no-new-function-as-prop
            inputRef={(ref: HTMLInputElement) => {
              inputRef.current = ref;
            }}
            fullWidth
            selectedOptions={selectedOptions}
            onChange={handleChange}
            onCreateOption={handleCreateOption}
            renderOption={renderOsqueryOption}
            rowHeight={32}
            isClearable
            {...euiFieldProps}
            options={(resultType.value === 'field' && euiFieldProps.options) || EMPTY_ARRAY}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFormRow>
  );
};

export const OsqueryColumnField = React.memo(
  OsqueryColumnFieldComponent,
  (prevProps, nextProps) =>
    prevProps.resultType.value === nextProps.resultType.value &&
    prevProps.resultType.isChangingValue === nextProps.resultType.isChangingValue &&
    prevProps.resultType.errors === nextProps.resultType.errors &&
    prevProps.resultValue.value === nextProps.resultValue.value &&
    prevProps.resultValue.isChangingValue === nextProps.resultValue.isChangingValue &&
    prevProps.resultValue.errors === nextProps.resultValue.errors &&
    deepEqual(prevProps.euiFieldProps, nextProps.euiFieldProps)
);

export interface ECSMappingEditorFieldProps {
  path: string;
  query: string;
  euiFieldProps: EuiComboBoxProps<{}>;
}

interface ECSMappingEditorFormProps {
  isDisabled?: boolean;
  osquerySchemaOptions: OsquerySchemaOption[];
  item: ArrayItem;
  onAdd: FormArrayField['addItem'];
  onDelete: FormArrayField['removeItem'];
  isLastItem: boolean;
}

const ecsFieldValidator = (
  args: ValidationFuncArg<ECSMappingEditorFormData, ECSMappingEditorFormData['key']>
) => {
  // console.error('getEcsFieldValidator', args);
  const fieldRequiredError = fieldValidators.emptyField(
    i18n.translate('xpack.osquery.pack.queryFlyoutForm.ecsFieldRequiredErrorMessage', {
      defaultMessage: 'ECS field is required.',
    })
  )(args);

  const ecsRowIndex = args.path.split('.')[0];
  const osqueryFieldValue = args.formData[`${ecsRowIndex}.result.value`];

  // console.error('ecsRowIndex', ecsRowIndex, osqueryFieldValue);

  if (
    ecsRowIndex &&
    fieldRequiredError &&
    ((args.customData.value.isLastItem && osqueryFieldValue?.length) ||
      !args.customData.value.isLastItem)
  ) {
    return fieldRequiredError;
  }

  return undefined;
};

const osqueryResultFieldValidator = (
  args: ValidationFuncArg<ECSMappingEditorFormData, ECSMappingEditorFormData['value']['value']>
) => {
  const fieldRequiredError = fieldValidators.emptyField(
    i18n.translate('xpack.osquery.pack.queryFlyoutForm.osqueryResultFieldRequiredErrorMessage', {
      defaultMessage: 'Value is required.',
    })
  )(args);

  const ecsRowIndex = args.path.split('.')[0];
  const ecsFieldValue = args.formData[`${ecsRowIndex}.key`];

  if (
    ecsRowIndex &&
    fieldRequiredError &&
    ((args.customData.value.isLastItem && ecsFieldValue?.length) ||
      !args.customData.value.isLastItem)
  ) {
    return fieldRequiredError;
  }

  // @ts-expect-error update types
  if (!args.value?.length || args.formData[`${ecsRowIndex}.result.type`] !== 'field') return;

  const osqueryColumnExists = find(args.customData.value.osquerySchemaOptions, [
    'label',
    args.value,
  ]);

  return !osqueryColumnExists
    ? {
        code: 'ERR_FIELD_FORMAT',
        path: args.path,
        message: i18n.translate(
          'xpack.osquery.pack.queryFlyoutForm.osqueryResultFieldValueMissingErrorMessage',
          {
            defaultMessage: 'The current query does not return a {columnName} field',
            values: {
              columnName: args.value,
            },
          }
        ),
        __isBlocking__: false,
      }
    : undefined;
};

interface ECSMappingEditorFormData {
  key: string;
  value: {
    field?: string;
    value?: string;
  };
}

export const ECSMappingEditorForm: React.FC<ECSMappingEditorFormProps> = ({
  isDisabled,
  osquerySchemaOptions,
  item,
  onAdd,
  onDelete,
  isLastItem,
}) => {
  console.error('item', item, isDisabled, isLastItem);

  const form = useFormContext();
  const [formData] = useFormData();

  const handleAddClick = useCallback(() => {
    onAdd();
  }, [onAdd]);

  const handleDeleteClick = useCallback(() => {
    onDelete(item.id);
  }, [item.id, onDelete]);

  const osquerySingleSelection = useMemo(() => {
    const formValue = get(formData, item.path);

    const ecsOption = find(ECSSchemaOptions, ['label', formValue?.key]);
    return ecsOption?.value?.normalization === 'array' && formValue.result.type === 'value'
      ? false
      : { asPlainText: true };
  }, [formData, item.path]);

  const MultiFields = useMemo(
    () => (
      <UseMultiFields
        // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
        fields={{
          resultType: {
            path: `${item.path}.result.type`,

            readDefaultValueOnForm: !item.isNew,
          },
          resultValue: {
            path: `${item.path}.result.value`,
            readDefaultValueOnForm: !item.isNew,
            validationData: {
              osquerySchemaOptions,
              isLastItem,
            },
            config: {
              validations: [
                {
                  validator: osqueryResultFieldValidator,
                },
              ],
            },
          },
        }}
      >
        {(fields) => (
          <OsqueryColumnField
            {...fields}
            // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
            euiFieldProps={{
              // @ts-expect-error update types
              options: osquerySchemaOptions,
              isDisabled,
              // @ts-expect-error update types
              singleSelection: osquerySingleSelection,
            }}
          />
        )}
      </UseMultiFields>
    ),
    [item.path, item.isNew, osquerySchemaOptions, isLastItem, isDisabled, osquerySingleSelection]
  );

  const ecsComboBoxEuiFieldProps = useMemo(
    () => ({
      isDisabled,
    }),
    [isDisabled]
  );

  const ecsFieldValidationData = useMemo(() => ({ isLastItem }), [isLastItem]);

  const ecsFieldConfig = useMemo(
    () => ({
      validations: [
        {
          validator: ecsFieldValidator,
        },
      ],
    }),
    []
  );

  return (
    <>
      <EuiFlexGroup alignItems="flexStart" gutterSize="s">
        <EuiFlexItem>
          <EuiFlexGroup alignItems="flexStart" gutterSize="s" wrap>
            <EuiFlexItem>
              <CommonUseField
                path={`${item.path}.key`}
                // component={ECSComboboxField}
                // euiFieldProps={ecsComboBoxEuiFieldProps}
                // readDefaultValueOnForm={!item.isNew}
                // validationData={ecsFieldValidationData}
                // config={ecsFieldConfig}
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <StyledSemicolonWrapper>
                <EuiText>:</EuiText>
              </StyledSemicolonWrapper>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFlexGroup alignItems="flexStart" gutterSize="s" wrap>
            <ECSFieldWrapper>{MultiFields}</ECSFieldWrapper>
            {!isDisabled && (
              <EuiFlexItem grow={false}>
                <StyledButtonWrapper>
                  {!isLastItem ? (
                    <EuiButtonIcon
                      aria-label={i18n.translate(
                        'xpack.osquery.pack.queryFlyoutForm.deleteECSMappingRowButtonAriaLabel',
                        {
                          defaultMessage: 'Delete ECS mapping row',
                        }
                      )}
                      id={`${item.path}-trash`}
                      iconType="trash"
                      color="danger"
                      onClick={handleDeleteClick}
                    />
                  ) : (
                    <EuiButtonIcon
                      aria-label={i18n.translate(
                        'xpack.osquery.pack.queryFlyoutForm.addECSMappingRowButtonAriaLabel',
                        {
                          defaultMessage: 'Add ECS mapping row',
                        }
                      )}
                      id={`${item.path}-plus-icon`}
                      iconType="plusInCircle"
                      color="primary"
                      onClick={handleAddClick}
                    />
                  )}
                </StyledButtonWrapper>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
    </>
  );
};

interface OsquerySchemaOption {
  label: string;
  value: {
    name: string;
    description: string;
    table: string;
    suggestion_label: string;
  };
}

interface OsqueryColumn {
  name: string;
  description: string;
  type: string;
  hidden: boolean;
  required: boolean;
  index: boolean;
}

export const ECSMappingEditorField = React.memo(
  ({ path, euiFieldProps }: ECSMappingEditorFieldProps) => {
    const [osquerySchemaOptions, setOsquerySchemaOptions] = useState<OsquerySchemaOption[]>([]);

    const [{ savedQueryId, query, ecs_mapping }] = useFormData({
      watch: ['savedQueryId', 'query', 'ecs_mapping'],
    });

    console.error('ecs_mapping', ecs_mapping);

    useEffect(() => {
      setOsquerySchemaOptions((currentValue) => {
        if (!query?.length) {
          return currentValue;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let ast: Record<string, any> | undefined;

        try {
          ast = sqlParser.parse(query)?.value;
        } catch (e) {
          return currentValue;
        }

        const astOsqueryTables: Record<
          string,
          {
            columns: OsqueryColumn[];
            order: number;
          }
        > =
          ast?.from?.value?.reduce(
            (
              acc: {
                [x: string]: {
                  columns: OsqueryColumn[];
                  order: number;
                };
              },
              table: {
                value: {
                  left?: { value: { value: string }; alias?: { value: string } };
                  right?: { value: { value: string }; alias?: { value: string } };
                  value?: { value: string };
                  alias?: { value: string };
                };
              }
            ) => {
              each(['value.left', 'value.right', 'value'], (valueKey) => {
                if (valueKey) {
                  const osqueryTable = find(osquerySchema, [
                    'name',
                    get(table, `${valueKey}.value.value`),
                  ]);

                  if (osqueryTable) {
                    acc[
                      get(table, `${valueKey}.alias.value`) ?? get(table, `${valueKey}.value.value`)
                    ] = {
                      columns: osqueryTable.columns,
                      order: Object.keys(acc).length,
                    };
                  }
                }
              });

              return acc;
            },
            {}
          ) ?? {};

        // Table doesn't exist in osquery schema
        if (isEmpty(astOsqueryTables)) {
          return currentValue;
        }

        const suggestions =
          isArray(ast?.selectItems?.value) &&
          ast?.selectItems?.value
            ?.map((selectItem: { type: string; value: string; hasAs: boolean; alias?: string }) => {
              if (selectItem.type === 'Identifier') {
                /*
                select * from routes, uptime;
              */
                if (ast?.selectItems?.value.length === 1 && selectItem.value === '*') {
                  return reduce(
                    astOsqueryTables,
                    (acc, { columns: osqueryColumns, order: tableOrder }, table) => {
                      acc.push(
                        ...osqueryColumns.map((osqueryColumn) => ({
                          label: osqueryColumn.name,
                          value: {
                            name: osqueryColumn.name,
                            description: osqueryColumn.description,
                            table,
                            tableOrder,
                            suggestion_label: osqueryColumn.name,
                          },
                        }))
                      );
                      return acc;
                    },
                    [] as OsquerySchemaOption[]
                  );
                }

                /*
                select i.*, p.resident_size, p.user_time, p.system_time, time.minutes as counter from osquery_info i, processes p, time where p.pid = i.pid;
              */

                const [table, column] = selectItem.value.includes('.')
                  ? selectItem.value?.split('.')
                  : [Object.keys(astOsqueryTables)[0], selectItem.value];

                if (column === '*' && astOsqueryTables[table]) {
                  const { columns: osqueryColumns, order: tableOrder } = astOsqueryTables[table];
                  return osqueryColumns.map((osqueryColumn) => ({
                    label: osqueryColumn.name,
                    value: {
                      name: osqueryColumn.name,
                      description: osqueryColumn.description,
                      table,
                      tableOrder,
                      suggestion_label: `${osqueryColumn.name}`,
                    },
                  }));
                }

                if (astOsqueryTables[table]) {
                  const osqueryColumn = find(astOsqueryTables[table].columns, ['name', column]);

                  if (osqueryColumn) {
                    const label = selectItem.hasAs ? selectItem.alias : column;

                    return [
                      {
                        label,
                        value: {
                          name: osqueryColumn.name,
                          description: osqueryColumn.description,
                          table,
                          tableOrder: astOsqueryTables[table].order,
                          suggestion_label: `${label}`,
                        },
                      },
                    ];
                  }
                }
              }

              /*
              SELECT pid, uid, name, ROUND((
                (user_time + system_time) / (cpu_time.tsb - cpu_time.itsb)
              ) * 100, 2) AS percentage
              FROM processes, (
              SELECT (
                SUM(user) + SUM(nice) + SUM(system) + SUM(idle) * 1.0) AS tsb,
                SUM(COALESCE(idle, 0)) + SUM(COALESCE(iowait, 0)) AS itsb
                FROM cpu_time
              ) AS cpu_time
              ORDER BY user_time+system_time DESC
              LIMIT 5;
            */

              if (selectItem.hasAs && selectItem.alias) {
                return [
                  {
                    label: selectItem.alias,
                    value: {
                      name: selectItem.alias,
                      description: '',
                      table: '',
                      tableOrder: -1,
                      suggestion_label: selectItem.alias,
                    },
                  },
                ];
              }

              return [];
            })
            .flat();

        // Remove column duplicates by keeping the column from the table that appears last in the query
        return sortedUniqBy(
          orderBy(suggestions, ['value.suggestion_label', 'value.tableOrder'], ['asc', 'desc']),
          'label'
        );
      });
    }, [query]);

    // const RenderUseArrayItems = useCallback(
    //   ({ items, addItem, removeItem }) => {
    //     console.error('items', items);
    //     return (
    //       <>
    //         {items.map((item) => (
    //           <ECSMappingEditorForm
    //             key={item.id}
    //             osquerySchemaOptions={osquerySchemaOptions}
    //             item={item}
    //             onAdd={addItem}
    //             onDelete={removeItem}
    //             isDisabled={!!euiFieldProps?.isDisabled}
    //             isLastItem={item.path === `ecs_mapping[${items.length - 1}]`}
    //           />
    //         ))}
    //       </>
    //     );
    //   },
    //   [euiFieldProps?.isDisabled, osquerySchemaOptions]
    // );

    return (
      <>
        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiTitle size="xs">
              <h5>
                <FormattedMessage
                  id="xpack.osquery.pack.form.ecsMappingSection.title"
                  defaultMessage="ECS mapping"
                />
              </h5>
            </EuiTitle>
            <EuiText color="subdued">
              <FormattedMessage
                id="xpack.osquery.pack.form.ecsMappingSection.description"
                defaultMessage="Use the fields below to map results from this query to ECS fields."
              />
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="s" />
        <EuiFlexGroup gutterSize="s">
          <EuiFlexItem>
            <EuiFormLabel>
              <FormattedMessage
                id="xpack.osquery.pack.queryFlyoutForm.mappingEcsFieldLabel"
                defaultMessage="ECS field"
              />
            </EuiFormLabel>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFormLabel>
              <FormattedMessage
                id="xpack.osquery.pack.queryFlyoutForm.mappingValueFieldLabel"
                defaultMessage="Value"
              />
            </EuiFormLabel>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="s" />
        <UseArray
          // key={formData.savedQueryId }
          path={path}
          // initialNumberOfItems={(ecs_mapping ?? []).length + 1}
        >
          {({ items, addItem, removeItem }) => {
            console.error('items', items);
            return (
              <>
                {items.map((item) => (
                  <div key={item.id}>
                    <UseField
                      path={`${item.path}.key`}
                      defaultValue="dupa"
                      readDefaultValueOnForm={true}
                    />
                    {/* <ECSMappingEditorForm
                      // key={item.id}
                      osquerySchemaOptions={osquerySchemaOptions}
                      item={item}
                      onAdd={addItem}
                      onDelete={removeItem}
                      isDisabled={!!euiFieldProps?.isDisabled}
                      isLastItem={item.path === `ecs_mapping[${items.length - 1}]`}
                    /> */}
                  </div>
                ))}
              </>
            );
          }}
        </UseArray>
      </>
    );
  }
);

// eslint-disable-next-line import/no-default-export
export default ECSMappingEditorField;
