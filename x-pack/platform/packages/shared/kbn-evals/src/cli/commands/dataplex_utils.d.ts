/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export declare const parseGsPath: (gcsPath: string) => {
  bucket: string;
  path: string;
};
export declare const titleCase: (s: string) => string;
export declare const buildEntrySourceDisplayName: (gcsPath: string) => string;
export declare const buildFullyQualifiedName: (gcsPath: string) => string;
export declare const formatShellCommand: (args: string[]) => string;
export interface SnapshotAspectData {
  gcs_path: string;
  description?: string;
  team?: string;
}
export declare const readAspectData: (filePath: string) => SnapshotAspectData;
export declare const listYamlFilesRecursively: (dir: string) => string[];
