/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { PathsOf, TypeOf, TypeAsArgs } from '@kbn/typed-react-router-config';
import { useNavigate } from 'react-router-dom-v5-compat';
import { useProfilingDependencies } from '../components/contexts/profiling_dependencies/use_profiling_dependencies';
import { ProfilingRouter, profilingRouter, ProfilingRoutes } from '../routing';

export interface StatefulProfilingRouter extends ProfilingRouter {
  push<T extends PathsOf<ProfilingRoutes>>(
    path: T,
    ...params: TypeAsArgs<TypeOf<ProfilingRoutes, T>>
  ): void;
  replace<T extends PathsOf<ProfilingRoutes>>(
    path: T,
    ...params: TypeAsArgs<TypeOf<ProfilingRoutes, T>>
  ): void;
}

export function useProfilingRouter(): StatefulProfilingRouter {
  const navigate = useNavigate();

  const {
    start: { core },
  } = useProfilingDependencies();

  const link = (...args: any[]) => {
    // @ts-expect-error
    return profilingRouter.link(...args);
  };

  return {
    ...profilingRouter,
    push: (...args) => {
      const next = link(...args);

      navigate(next);
    },
    replace: (path, ...args) => {
      const next = link(path, ...args);
      navigate(next, { replace: true });
    },
    link: (path, ...args) => {
      return core.http.basePath.prepend('/app/profiling' + link(path, ...args));
    },
  };
}
