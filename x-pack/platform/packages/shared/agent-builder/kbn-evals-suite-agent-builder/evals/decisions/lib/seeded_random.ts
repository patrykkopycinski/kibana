/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

const MODULUS = 2147483647;
const MULTIPLIER = 48271;

/**
 * Park–Miller minimal-standard generator: deterministic, so splits and samples are
 * reproducible from a seed. Products stay below 2^53, so plain number arithmetic is exact.
 */
export const createSeededRandom = (seed: number): (() => number) => {
  let state = Math.abs(Math.trunc(seed)) % MODULUS || 1;
  return () => {
    state = (state * MULTIPLIER) % MODULUS;
    return (state - 1) / (MODULUS - 1);
  };
};

export const seededShuffle = <T>(items: readonly T[], seed: number): T[] => {
  const random = createSeededRandom(seed);
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
