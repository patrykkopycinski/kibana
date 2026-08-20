/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type React from 'react';
import type { MountPoint } from '@kbn/core-mount-utils-browser';
export interface MountWrapperComponentProps {
  mount: MountPoint;
  className?: string;
}
/**
 * MountWrapper is a react component to mount a {@link MountPoint} inside a react tree.
 * @internal
 */
type MountWrapperComponent = React.FunctionComponent<MountWrapperComponentProps>;
/**
 * MountWrapper is a react component to mount a {@link MountPoint} inside a react tree.
 * @internal
 */
export declare const MountWrapper: MountWrapperComponent;
/**
 * Mount converter for react node.
 * This should only be used in internal Core packages to prevent circular dependency issues
 *
 * @param node to get a mount for
 * @internal
 */
export declare const mountReactNode: (node: React.ReactNode) => MountPoint;
export {};
