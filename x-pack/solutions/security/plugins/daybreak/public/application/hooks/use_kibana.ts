/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useKibana as useKibanaReact } from '@kbn/kibana-react-plugin/public';
import type { CoreStart } from '@kbn/core/public';
import type { ProposalsService } from '../../services/proposals_service';

/** Services injected into the `KibanaContextProvider` in `mount.tsx`. */
export interface DaybreakKibanaServices extends CoreStart {
  proposalsService: ProposalsService;
}

/** Typed wrapper over `@kbn/kibana-react-plugin`'s `useKibana` (FR-010). */
export const useKibana = () => useKibanaReact<DaybreakKibanaServices>();
