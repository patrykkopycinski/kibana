/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KbnClientRequester } from './kbn_client_requester';
interface UpdateBody {
  name: string;
  description?: string;
  disabledFeatures?: string | string[];
  initials?: string;
  color?: string;
  imageUrl?: string;
}
interface CreateBody extends UpdateBody {
  id: string;
}
export declare class KbnClientSpaces {
  private readonly requester;
  constructor(requester: KbnClientRequester);
  create(body: CreateBody): Promise<void>;
  update(id: string, body: UpdateBody): Promise<void>;
  get(id: string): Promise<unknown>;
  list(): Promise<unknown>;
  delete(id: string): Promise<void>;
}
export {};
