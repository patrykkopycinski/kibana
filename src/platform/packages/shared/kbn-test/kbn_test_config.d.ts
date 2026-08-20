/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export interface UrlParts {
  protocol?: string;
  hostname?: string;
  port?: number;
  auth?: string;
  username?: string;
  password?: string;
}
interface UserAuth {
  username: string;
  password: string;
}
export declare const kbnTestConfig: {
  getPort(): number | undefined;
  getUrlParts(user?: UserAuth): UrlParts;
  /**
   * Use to get `port:undefined` for assertions if the port is default for the
   * used protocol and thus would be stripped by the browser
   */
  getUrlPartsWithStrippedDefaultPort(user?: UserAuth): UrlParts;
};
export {};
