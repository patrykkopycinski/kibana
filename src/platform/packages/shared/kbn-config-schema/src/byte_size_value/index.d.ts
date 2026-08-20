/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export type ByteSizeValueUnit = 'b' | 'kb' | 'mb' | 'gb';
export declare class ByteSizeValue {
  private readonly valueInBytes;
  static parse(text: string): ByteSizeValue;
  constructor(valueInBytes: number);
  isGreaterThan(other: ByteSizeValue): boolean;
  isLessThan(other: ByteSizeValue): boolean;
  isEqualTo(other: ByteSizeValue): boolean;
  getValueInBytes(): number;
  toString(returnUnit?: ByteSizeValueUnit): string;
}
export declare const bytes: (value: number) => ByteSizeValue;
export declare const kb: (value: number) => ByteSizeValue;
export declare const mb: (value: number) => ByteSizeValue;
export declare const gb: (value: number) => ByteSizeValue;
export declare const tb: (value: number) => ByteSizeValue;
export declare function ensureByteSizeValue(
  value?: ByteSizeValue | string | number
): ByteSizeValue | undefined;
