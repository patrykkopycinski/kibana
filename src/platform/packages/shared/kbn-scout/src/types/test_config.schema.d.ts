/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ZodError } from '@kbn/zod/v4';
import type { z } from '@kbn/zod/v4';
/**
 * Schema for the JSON config files consumed by Scout (`local.json`,
 * `cloud_ech.json`, `cloud_mki.json`).
 *
 * Defaults are applied for fields that are present in the auto-generated
 * `local.json` but commonly omitted from manually-authored cloud configs
 * (`http2`, `uiam`, `license`). All other required fields raise a clear
 * validation error if missing or invalid.
 *
 * Cross-field rules enforced via `superRefine`:
 * - `serverless: true` requires `projectType`.
 * - `serverless: true` with `projectType` of `security` or `oblt` requires
 *   `productTier`.
 * - `serverless: false` (stateful) forbids `projectType`, `productTier`,
 *   `organizationId`, `linkedProject`, and `uiam: true` (UIAM is serverless-
 *   only).
 * - `isCloud: true` requires `cloudHostName` (used by SAML against Elastic
 *   Cloud), forbids `http2: true`, and forbids any `uiam` value that does not
 *   match `serverless` (UIAM behavior on cloud is fixed). Local runs may set
 *   `uiam` freely so TS server configs can drive it via `esServerlessOptions`.
 */
export declare const ScoutTestConfigSchema: z.ZodPipe<
  z.ZodObject<
    {
      serverless: z.ZodBoolean;
      http2: z.ZodDefault<z.ZodBoolean>;
      uiam: z.ZodOptional<z.ZodBoolean>;
      isCloud: z.ZodBoolean;
      cloudHostName: z.ZodOptional<z.ZodString>;
      cloudUsersFilePath: z.ZodString;
      license: z.ZodDefault<z.ZodString>;
      projectType: z.ZodOptional<
        z.ZodEnum<{
          es: 'es';
          oblt: 'oblt';
          security: 'security';
          vectordb: 'vectordb';
          workplaceai: 'workplaceai';
        }>
      >;
      productTier: z.ZodOptional<
        z.ZodEnum<{
          complete: 'complete';
          essentials: 'essentials';
          logs_essentials: 'logs_essentials';
          search_ai_lake: 'search_ai_lake';
        }>
      >;
      organizationId: z.ZodOptional<z.ZodString>;
      hosts: z.ZodObject<
        {
          kibana: z.ZodURL;
          elasticsearch: z.ZodURL;
        },
        z.core.$strip
      >;
      auth: z.ZodObject<
        {
          username: z.ZodString;
          password: z.ZodString;
        },
        z.core.$strip
      >;
      linkedProject: z.ZodOptional<
        z.ZodObject<
          {
            hosts: z.ZodObject<
              {
                elasticsearch: z.ZodURL;
              },
              z.core.$strip
            >;
            auth: z.ZodObject<
              {
                username: z.ZodString;
                password: z.ZodString;
              },
              z.core.$strip
            >;
          },
          z.core.$strip
        >
      >;
      metadata: z.ZodOptional<z.ZodAny>;
    },
    z.core.$strip
  >,
  z.ZodTransform<
    {
      serverless: boolean;
      http2: boolean;
      isCloud: boolean;
      cloudHostName?: string | undefined;
      cloudUsersFilePath: string;
      license: string;
      projectType?: 'es' | 'oblt' | 'security' | 'vectordb' | 'workplaceai' | undefined;
      productTier?: 'complete' | 'essentials' | 'logs_essentials' | 'search_ai_lake' | undefined;
      organizationId?: string | undefined;
      hosts: {
        kibana: string;
        elasticsearch: string;
      };
      auth: {
        username: string;
        password: string;
      };
      linkedProject?:
        | {
            hosts: {
              elasticsearch: string;
            };
            auth: {
              username: string;
              password: string;
            };
          }
        | undefined;
      metadata?: any;
      uiam: boolean;
    },
    {
      serverless: boolean;
      http2: boolean;
      uiam?: boolean | undefined;
      isCloud: boolean;
      cloudHostName?: string | undefined;
      cloudUsersFilePath: string;
      license: string;
      projectType?: 'es' | 'oblt' | 'security' | 'vectordb' | 'workplaceai' | undefined;
      productTier?: 'complete' | 'essentials' | 'logs_essentials' | 'search_ai_lake' | undefined;
      organizationId?: string | undefined;
      hosts: {
        kibana: string;
        elasticsearch: string;
      };
      auth: {
        username: string;
        password: string;
      };
      linkedProject?:
        | {
            hosts: {
              elasticsearch: string;
            };
            auth: {
              username: string;
              password: string;
            };
          }
        | undefined;
      metadata?: any;
    }
  >
>;
/**
 * Format a Zod validation error from {@link ScoutTestConfigSchema} into a
 * single, human-friendly message. Each issue is rendered as
 * `'<field.path>' <message>`, prefixed with the source (file path) the config
 * was loaded from when provided.
 */
export declare const formatScoutTestConfigError: (error: ZodError, source?: string) => string;
/**
 * Validate and normalize a Scout test config object. Throws a friendly,
 * aggregated error message on validation failure.
 */
export declare const parseScoutTestConfig: (
  input: unknown,
  source?: string
) => z.infer<typeof ScoutTestConfigSchema>;
