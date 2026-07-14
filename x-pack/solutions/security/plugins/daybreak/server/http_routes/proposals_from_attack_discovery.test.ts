/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { registerProposalsFromAttackDiscoveryRoute } from "./proposals_from_attack_discovery";
import type { RouteDependencies } from "./types";

const createMockRouter = () => {
  const routes: Array<{ path: string; method: string }> = [];
  return {
    routes,
    get: jest.fn(),
    post: jest.fn((config: { path: string }) => {
      routes.push({ path: config.path, method: "POST" });
      return jest.fn();
    }),
    put: jest.fn(),
    delete: jest.fn(),
  };
};

const createMockDependencies = (): RouteDependencies => {
  const router = createMockRouter() as unknown as RouteDependencies["router"];
  return {
    router,
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      get: jest.fn().mockReturnThis(),
    } as unknown as RouteDependencies["logger"],
    getSpaceId: jest.fn().mockReturnValue("default"),
  };
};

describe("proposals_from_attack_discovery route (Gap #12)", () => {
  it("registers POST /api/daybreak/proposals/from-attack-discovery", () => {
    const deps = createMockDependencies();
    registerProposalsFromAttackDiscoveryRoute(deps);
    expect(deps.router.post).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/api/daybreak/proposals/from-attack-discovery" }),
      expect.any(Function)
    );
  });
});
