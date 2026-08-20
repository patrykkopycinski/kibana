/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import type moment from 'moment';
export type Unit = 'ms' | 's' | 'm' | 'h' | 'd' | 'w' | 'M' | 'y';
export type UnitsMap = {
  [k in Unit]: {
    weight: number;
    type: 'calendar' | 'fixed' | 'mixed';
    base: number;
  };
};
export declare const unitsMap: UnitsMap;
export declare const units: Unit[];
export declare const unitsDesc: Unit[];
export declare const unitsAsc: Unit[];
export declare function parse(
  input: string,
  options?: {
    roundUp?: boolean;
    momentInstance?: typeof moment;
    forceNow?: Date;
  }
): moment.Moment | undefined;
declare const _default: {
  parse: typeof parse;
  unitsMap: Readonly<UnitsMap>;
  units: readonly Unit[];
  unitsAsc: readonly Unit[];
  unitsDesc: readonly Unit[];
};
export default _default;
