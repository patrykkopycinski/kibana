/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { injectI18n, InjectedIntl } from '@kbn/i18n-react';
import {
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiButton,
  EuiSpacer,
  EuiCallOut,
} from '@elastic/eui';
import {
  SimpleSavedObject,
  SavedObjectsBatchResponse,
  SavedObjectsBulkCreateObject,
  SavedObjectsBulkCreateOptions,
} from '@kbn/core-saved-objects-api-browser';

export interface SavedObjectShape extends SimpleSavedObject {
  version?: string;
}

interface SavedObjectInstallerProps {
  intl: InjectedIntl;
  bulkCreate: (
    objects: Array<SavedObjectsBulkCreateObject<unknown>>,
    options?: SavedObjectsBulkCreateOptions | undefined
  ) => Promise<SavedObjectsBatchResponse<unknown>>;
  savedObjects: SavedObjectShape[];
  installMsg?: string;
}
interface SavedObjectInstallerState {
  isInstalling: boolean;
  installStatusMsg: string;
  isInstalled: boolean;
  overwrite: boolean;
  buttonLabel: string;
}

class SavedObjectsInstallerUi extends React.Component<
  SavedObjectInstallerProps,
  SavedObjectInstallerState
> {
  private _isMounted: boolean;

  constructor(props: SavedObjectInstallerProps) {
    super(props);

    this.state = {
      isInstalling: false,
      isInstalled: false,
      overwrite: false,
      buttonLabel: this.DEFAULT_BUTTON_LABEL,
      installStatusMsg: '',
    };
    this._isMounted = false;
  }

  DEFAULT_BUTTON_LABEL = this.props.intl.formatMessage({
    id: 'home.tutorial.savedObject.defaultButtonLabel',
    defaultMessage: 'Load Kibana objects',
  });

  componentDidMount() {
    this._isMounted = true;
  }

  componentWillUnmount() {
    this._isMounted = false;
  }

  installSavedObjects = async () => {
    this.setState({
      isInstalling: true,
    });

    let resp;
    try {
      // Filter out the saved object version field, if present, to avoid inadvertently triggering optimistic concurrency control.
      const objectsToCreate = this.props.savedObjects.map(
        ({ version, ...savedObject }) => savedObject
      );
      resp = await this.props.bulkCreate(objectsToCreate, { overwrite: this.state.overwrite });
    } catch (error) {
      if (!this._isMounted) {
        return;
      }

      this.setState({
        isInstalling: false,
        installStatusMsg: this.props.intl.formatMessage(
          {
            id: 'home.tutorial.savedObject.requestFailedErrorMessage',
            defaultMessage: 'Request failed, Error: {message}',
          },
          { message: error.message }
        ),
        isInstalled: false,
        overwrite: false,
        buttonLabel: this.DEFAULT_BUTTON_LABEL,
      });
      return;
    }

    if (!this._isMounted) {
      return;
    }

    const errors = resp.savedObjects.filter((savedObject) => {
      return Boolean(savedObject.error);
    });

    const overwriteErrors = errors.filter((savedObject) => {
      return savedObject.error?.statusCode === 409;
    });
    if (overwriteErrors.length > 0) {
      this.setState({
        isInstalling: false,
        installStatusMsg: this.props.intl.formatMessage(
          {
            id: 'home.tutorial.savedObject.installStatusLabel',
            defaultMessage:
              "{overwriteErrorsLength} of {savedObjectsLength} objects already exist. \
Click 'Confirm overwrite' to import and overwrite existing objects. Any changes to the objects will be lost.",
          },
          {
            overwriteErrorsLength: overwriteErrors.length,
            savedObjectsLength: this.props.savedObjects.length,
          }
        ),
        isInstalled: false,
        overwrite: true,
        buttonLabel: this.props.intl.formatMessage({
          id: 'home.tutorial.savedObject.confirmButtonLabel',
          defaultMessage: 'Confirm overwrite',
        }),
      });
      return;
    }

    const hasErrors = errors.length > 0;
    const statusMsg = hasErrors
      ? this.props.intl.formatMessage(
          {
            id: 'home.tutorial.savedObject.unableToAddErrorMessage',
            defaultMessage:
              'Unable to add {errorsLength} of {savedObjectsLength} kibana objects, Error: {errorMessage}',
          },
          {
            errorsLength: errors.length,
            savedObjectsLength: this.props.savedObjects.length,
            errorMessage: errors[0].error?.message,
          }
        )
      : this.props.intl.formatMessage(
          {
            id: 'home.tutorial.savedObject.addedLabel',
            defaultMessage: '{savedObjectsLength} saved objects successfully added',
          },
          { savedObjectsLength: this.props.savedObjects.length }
        );
    this.setState({
      isInstalling: false,
      installStatusMsg: statusMsg,
      isInstalled: !hasErrors,
      overwrite: false,
      buttonLabel: this.DEFAULT_BUTTON_LABEL,
    });
  };

  renderInstallMessage() {
    if (!this.state.installStatusMsg) {
      return;
    }

    return (
      <EuiCallOut
        title={this.state.installStatusMsg}
        color={this.state.isInstalled ? 'success' : 'warning'}
        data-test-subj={
          this.state.isInstalled ? 'loadSavedObjects_success' : 'loadSavedObjects_failed'
        }
      />
    );
  }

  render() {
    const installMsg = this.props.installMsg
      ? this.props.installMsg
      : this.props.intl.formatMessage({
          id: 'home.tutorial.savedObject.installLabel',
          defaultMessage: 'Imports index pattern, visualizations and pre-defined dashboards.',
        });

    return (
      <>
        <EuiTitle size="m">
          <h2>
            {this.props.intl.formatMessage({
              id: 'home.tutorial.savedObject.loadTitle',
              defaultMessage: 'Load Kibana objects',
            })}
          </h2>
        </EuiTitle>
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
          <EuiFlexItem>
            <EuiText>
              <p>{installMsg}</p>
            </EuiText>
          </EuiFlexItem>

          <EuiFlexItem grow={false}>
            <EuiButton
              onClick={this.installSavedObjects}
              isLoading={this.state.isInstalling}
              data-test-subj="loadSavedObjects"
            >
              {this.state.buttonLabel}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="s" />

        {this.renderInstallMessage()}
      </>
    );
  }
}

export const SavedObjectsInstaller = injectI18n(SavedObjectsInstallerUi);
