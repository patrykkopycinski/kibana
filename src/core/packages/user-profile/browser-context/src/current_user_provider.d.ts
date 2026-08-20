/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FC, PropsWithChildren } from 'react';
import type { CurrentUserServices } from './current_user_context';
export type CurrentUserProviderProps = CurrentUserServices;
/**
 * Supplies the Core services that `useCurrentUser` hook needs.
 *
 * Network requests are deduped by the underlying client caches, so no shared store is required.
 */
export declare const CurrentUserProvider: FC<PropsWithChildren<CurrentUserProviderProps>>;
