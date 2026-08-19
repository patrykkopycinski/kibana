import type { z } from '@kbn/zod/v4';
import type { ScoutTestConfigSchema } from './test_config.schema';
/**
 * Serverless product tier sourced from `@kbn/es`. For project types that
 * expose a tier today (`security`, `oblt`), Scout requires this to be set on
 * cloud (MKI) configs and derives it from server args for local serverless
 * configs (defaulting to `complete` when no tier-specific args are present).
 */
export type { ServerlessProductTier } from '@kbn/es';
/**
 * Shape of the JSON files Scout reads to point tests at a deployment
 * (`local.json`, `cloud_ech.json`, `cloud_mki.json`). The canonical schema
 * with required/optional/conditional rules lives in `./test_config.schema.ts`.
 */
export type ScoutTestConfig = z.infer<typeof ScoutTestConfigSchema>;
