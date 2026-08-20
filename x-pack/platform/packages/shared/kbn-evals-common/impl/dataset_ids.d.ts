/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * The id a dataset takes in a space. The default space keeps the derivation it
 * had before space-awareness, so ids already stored still point at the same
 * dataset.
 *
 * Later generations are the ids a create falls through to when an earlier one is
 * held by a dataset that has moved away; being derived is what makes two creates
 * of one name compete for a single id. A lookup wants the first.
 *
 * Kept out of the plugin because the offline client derives ids too, and one the
 * server disagreed with would point scores at a dataset that doesn't exist.
 */
export declare const getDatasetId: (spaceId: string, name: string, generation?: number) => string;
