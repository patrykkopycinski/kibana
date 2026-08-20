/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export declare function getCopyrightHeader(basePath: string): string;
export declare function getScoutPackageImport(basePath: string): string;
export declare function generateConfigContent(
  scoutPackage: string,
  testDir: string,
  copyrightHeader: string,
  options?: {
    workers?: number;
    runGlobalSetup?: boolean;
  }
): string;
export declare function generateUiParallelGlobalSetupContent(
  scoutPackage: string,
  copyrightHeader: string
): string;
export declare function generateApiSpecContent(
  scoutPackage: string,
  copyrightHeader: string
): string;
export declare function generateApiConstantsContent(copyrightHeader: string): string;
export declare function generateApiFixturesIndexContent(
  scoutPackage: string,
  copyrightHeader: string
): string;
export declare function generateUiSpecContent(
  scoutPackage: string,
  copyrightHeader: string
): string;
export declare function generateUiParallelSpecContent(
  scoutPackage: string,
  copyrightHeader: string
): string;
export declare function generateUiConstantsContent(copyrightHeader: string): string;
export declare function generateUiPageObjectsIndexContent(copyrightHeader: string): string;
export declare function generateUiDemoPageContent(
  scoutPackage: string,
  copyrightHeader: string
): string;
export declare function generateUiFixturesIndexContent(
  scoutPackage: string,
  copyrightHeader: string,
  includeParallel: boolean
): string;
