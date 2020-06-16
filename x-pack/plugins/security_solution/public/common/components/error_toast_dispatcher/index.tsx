/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { appSelectors, State } from '../../store';
import { appActions } from '../../store/app';
import { useStateToaster } from '../toasters';

interface Props {
  toastLifeTimeMs?: number;
}

const ErrorToastDispatcherComponent: React.FC<Props> = ({ toastLifeTimeMs = 5000 }) => {
  const dispatch = useDispatch();
  const errors = useSelector(appSelectors.errorsSelector) ?? [];
  const [{ toasts }, dispatchToaster] = useStateToaster();

  useEffect(() => {
    errors.forEach(({ id, title, message }) => {
      if (!toasts.some((toast) => toast.id === id)) {
        dispatchToaster({
          type: 'addToaster',
          toast: {
            color: 'danger',
            id,
            iconType: 'alert',
            title,
            errors: message,
            toastLifeTimeMs,
          },
        });
      }
      dispatch(appActions.removeError({ id }));
    });
  });

  return null;
};

export const ErrorToastDispatcher = React.memo(ErrorToastDispatcherComponent);
