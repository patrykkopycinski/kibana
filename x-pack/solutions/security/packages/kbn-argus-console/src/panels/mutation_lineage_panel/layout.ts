/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { CANONICAL_STAGE_ORDER } from '@kbn/argus-console-common';
import type { LineageNodeType } from '@kbn/argus-console-common';

export const NODE_WIDTH = 140;
export const NODE_HEIGHT = 56;
export const COLUMN_SPACING = 180;
export const ROW_Y_TOP = 60;
export const ROW_Y_DRIFT = 180;

const TOP_ROW_COORDS: Record<LineageNodeType, { x: number; y: number }> = (() => {
  const out: Partial<Record<LineageNodeType, { x: number; y: number }>> = {};
  CANONICAL_STAGE_ORDER.forEach((type, index) => {
    out[type] = { x: index * COLUMN_SPACING, y: ROW_Y_TOP };
  });
  out.drift_detected = {
    x: CANONICAL_STAGE_ORDER.indexOf('observe') * COLUMN_SPACING,
    y: ROW_Y_DRIFT,
  };
  return out as Record<LineageNodeType, { x: number; y: number }>;
})();

export const nodeTopLeft = (type: LineageNodeType): { x: number; y: number } =>
  TOP_ROW_COORDS[type];

export const nodeCenter = (type: LineageNodeType): { x: number; y: number } => {
  const tl = TOP_ROW_COORDS[type];
  return { x: tl.x + NODE_WIDTH / 2, y: tl.y + NODE_HEIGHT / 2 };
};

export const viewBoxWidth =
  CANONICAL_STAGE_ORDER.length * COLUMN_SPACING - COLUMN_SPACING + NODE_WIDTH + 40;

export const viewBoxHeight = ROW_Y_DRIFT + NODE_HEIGHT + 40;
