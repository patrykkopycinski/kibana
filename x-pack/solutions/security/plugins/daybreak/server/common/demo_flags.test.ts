/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

describe("demo_flags (Defend enrollment gap)", () => {
  const original = process.env.DAYBREAK_STUB_ENDPOINT_ACTIONS;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.DAYBREAK_STUB_ENDPOINT_ACTIONS;
    } else {
      process.env.DAYBREAK_STUB_ENDPOINT_ACTIONS = original;
    }
    jest.resetModules();
  });

  it("defaults stub endpoint actions on for demo (no Fleet required)", async () => {
    delete process.env.DAYBREAK_STUB_ENDPOINT_ACTIONS;
    jest.resetModules();
    const { DAYBREAK_STUB_ENDPOINT_ACTIONS } = await import("./demo_flags");
    expect(DAYBREAK_STUB_ENDPOINT_ACTIONS).toBe(true);
  });

  it("disables stub when DAYBREAK_STUB_ENDPOINT_ACTIONS=0", async () => {
    process.env.DAYBREAK_STUB_ENDPOINT_ACTIONS = "0";
    jest.resetModules();
    const { DAYBREAK_STUB_ENDPOINT_ACTIONS } = await import("./demo_flags");
    expect(DAYBREAK_STUB_ENDPOINT_ACTIONS).toBe(false);
  });
});
