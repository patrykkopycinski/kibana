/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export declare function splitIntoCommands(query: string): {
  name: string | undefined;
  command: string;
}[];
export declare function correctCommonEsqlMistakes(query: string): {
  isCorrection: boolean;
  input: string;
  output: string;
};
