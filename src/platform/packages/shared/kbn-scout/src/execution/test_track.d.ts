/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { z } from '@kbn/zod/v4';
export declare class TestTrackError extends Error {}
export declare const TestTrackSpecSchema: z.ZodObject<
  {
    stats: z.ZodObject<
      {
        lane: z.ZodObject<
          {
            count: z.ZodInt;
            saturationPercent: z.ZodNumber;
            longestEstimate: z.ZodNumber;
            shortestEstimate: z.ZodNumber;
          },
          z.core.$strip
        >;
        combinedRuntime: z.ZodObject<
          {
            target: z.ZodInt;
            expected: z.ZodInt;
            unused: z.ZodInt;
            overflow: z.ZodInt;
          },
          z.core.$strip
        >;
      },
      z.core.$strip
    >;
    lanes: z.ZodArray<
      z.ZodObject<
        {
          number: z.ZodInt;
          estimatedSetupDuration: z.ZodNumber;
          runtimeTarget: z.ZodInt;
          runtimeEstimate: z.ZodNumber;
          availableCapacity: z.ZodNumber;
          status: z.ZodEnum<{
            closed: 'closed';
            open: 'open';
          }>;
          isCongested: z.ZodBoolean;
          loads: z.ZodArray<z.ZodString>;
          metadata: z.ZodRecord<z.ZodString, z.ZodAny>;
        },
        z.core.$strip
      >
    >;
    metadata: z.ZodRecord<z.ZodString, z.ZodAny>;
  },
  z.core.$strip
>;
export type TestTrackSpec = z.infer<typeof TestTrackSpecSchema>;
export type TestTrackLaneStatus = z.infer<
  typeof TestTrackSpecSchema.shape.lanes.element.shape.status
>;
export declare const TestTrackLoadSchema: z.ZodObject<
  {
    id: z.ZodString;
    stats: z.ZodObject<
      {
        runCount: z.ZodInt;
        runtime: z.ZodObject<
          {
            avg: z.ZodInt;
            median: z.ZodInt;
            pc95th: z.ZodInt;
            pc99th: z.ZodInt;
            max: z.ZodInt;
            estimate: z.ZodInt;
          },
          z.core.$strip
        >;
      },
      z.core.$strip
    >;
    metadata: z.ZodRecord<z.ZodString, z.ZodAny>;
  },
  z.core.$strip
>;
export type TestTrackLoad = z.infer<typeof TestTrackLoadSchema>;
export declare class TestTrackLane {
  number: number;
  estimatedSetupDuration: number;
  runtimeTarget: number;
  loads: TestTrackLoad[];
  metadata: Record<string, any>;
  constructor(options: { number: number; runtimeTarget: number; estimatedSetupDuration?: number });
  get runtimeEstimate(): number;
  get availableCapacity(): number;
  get isCongested(): boolean;
  get status(): TestTrackLaneStatus;
}
export declare class TestTrack {
  runtimeTarget: number;
  estimatedLaneSetupDuration: number;
  lanes: TestTrackLane[];
  metadata: Record<string, any>;
  constructor(options: { runtimeTarget: number; estimatedLaneSetupDuration?: number });
  get laneCount(): number;
  get openLanes(): TestTrackLane[];
  get anyLaneOpen(): boolean;
  get leastLoadedOpenLane(): TestTrackLane | undefined;
  get leastLoadedLane(): TestTrackLane | undefined;
  addLane(): TestTrackLane;
  addLoadToNewLane(load: TestTrackLoad): TestTrackLane;
  addLoadToLeastCongestedLane(load: TestTrackLoad, allowNewLane: boolean): TestTrackLane;
  get specification(): TestTrackSpec;
}
