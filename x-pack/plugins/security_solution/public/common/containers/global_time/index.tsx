/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import React, { useCallback, useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { inputsModel, inputsSelectors, State } from '../../store';
import { inputsActions } from '../../store/actions';

interface SetQuery {
  id: string;
  inspect: inputsModel.InspectQuery | null;
  loading: boolean;
  refetch: inputsModel.Refetch | inputsModel.RefetchKql;
}

export interface GlobalTimeArgs {
  from: number;
  to: number;
  setQuery: ({ id, inspect, loading, refetch }: SetQuery) => void;
  deleteQuery?: ({ id }: { id: string }) => void;
  isInitializing: boolean;
}

interface OwnProps {
  children: (args: GlobalTimeArgs) => React.ReactNode;
}

type GlobalTimeProps = OwnProps;

export const GlobalTimeComponent: React.FC<GlobalTimeProps> = ({ children, from, to }) => {
  const dispatch = useDispatch();
  const { from, to } = useSelector(inputsSelectors.globalTimeRangeSelector);
  const [isInitializing, setIsInitializing] = useState(true);

  const setQuery = useCallback(
    ({ id, inspect, loading, refetch }: SetQuery) =>
      dispatch(inputsActions.setGlobalQuery({ inputId: 'global', id, inspect, loading, refetch })),
    [dispatch]
  );

  const deleteQuery = useCallback(
    ({ id }: { id: string }) => dispatch(inputsActions.deleteOneQuery({ inputId: 'global', id })),
    [dispatch]
  );

  useEffect(() => {
    if (isInitializing) {
      setIsInitializing(false);
    }
    return () => {
      dispatch(inputsActions.deleteAllQuery({ id: 'global' }));
    };
  }, [dispatch, isInitializing]);

  return (
    <>
      {children({
        isInitializing,
        from,
        to,
        setQuery,
        deleteQuery,
      })}
    </>
  );
};

export const GlobalTime = React.memo(GlobalTimeComponent);
