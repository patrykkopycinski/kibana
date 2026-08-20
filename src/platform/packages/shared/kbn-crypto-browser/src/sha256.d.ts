/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

type BufferEncoding =
  | 'ascii'
  | 'utf8'
  | 'utf-8'
  | 'utf16le'
  | 'ucs2'
  | 'ucs-2'
  | 'base64'
  | 'latin1'
  | 'binary'
  | 'hex';
export declare class Sha256 {
  private _a;
  private _b;
  private _c;
  private _d;
  private _e;
  private _f;
  private _g;
  private _h;
  private _block;
  private _finalSize;
  private _blockSize;
  private _len;
  private _s;
  private _w;
  constructor();
  update(data: string | Buffer, encoding?: BufferEncoding): Sha256;
  digest(encoding: BufferEncoding): string;
  _update(M: Buffer): void;
  _hash(): Buffer<ArrayBuffer>;
}
export {};
