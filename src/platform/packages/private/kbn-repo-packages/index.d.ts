/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export { Package };
export { readHashOfPackageMap };
export { readPackageMap };
export { getPackages };
export { getPkgDirMap };
export { getPkgsById };
export { updatePackageMap };
export { removePackagesFromPackageMap };
export { findPackageForPath };
export { readPackageManifest };
export { Jsonc };
export { getPluginPackagesFilter };
export { getPluginSearchPaths };
export { parseKbnImportReq };
export { getRepoRels };
export { getRepoRelsSync };
export { readPackageJson };
export type PluginPackage = import('./modern/types').PluginPackage;
export type PluginSelector = import('./modern/types').PluginSelector;
export type KibanaPackageManifest = import('./modern/types').KibanaPackageManifest;
export type PluginPackageManifest = import('./modern/types').PluginPackageManifest;
export type SharedBrowserPackageManifest = import('./modern/types').SharedBrowserPackageManifest;
export type BasePackageManifest = import('./modern/types').BasePackageManifest;
export type KibanaPackageType = import('./modern/types').KibanaPackageType;
export type PackageExports = import('./modern/types').PackageExports;
export type ParsedPackageJson = import('./modern/types').ParsedPackageJson;
export type KbnImportReq = import('./modern/types').KbnImportReq;
export type PluginCategoryInfo = import('./modern/types').PluginCategoryInfo;
export type PackageMap = Map<string, string>;
export type PkgDirMap = import('./modern/get_packages').PkgDirMap;
import {
  getPackages,
  findPackageForPath,
  getPkgDirMap,
  getPkgsById,
  updatePackageMap,
  removePackagesFromPackageMap,
  readHashOfPackageMap,
  readPackageMap,
} from './modern/get_packages';
import { readPackageManifest } from './modern/parse_package_manifest';
import { Package } from './modern/package';
import { parseKbnImportReq } from './modern/parse_kbn_import_req';
import { getRepoRels, getRepoRelsSync } from './modern/get_repo_rels';
import Jsonc = require('./utils/jsonc');
import { getPluginPackagesFilter, getPluginSearchPaths } from './modern/plugins';
import { readPackageJson } from './modern/parse_package_json';
