import type { ServerlessProjectType, ServerlessProductTier } from '@kbn/es';
export declare const formatCurrentDate: () => string;
export declare const getProjectType: (kbnServerArgs: string[]) => ServerlessProjectType;
export declare const getOrganizationId: (kbnServerArgs: string[]) => string | undefined;
/**
 * Resolves the serverless product tier from `kbnTestServer.serverArgs`.
 *
 * - `security` projects encode the tier in
 *   `--xpack.securitySolutionServerless.productTypes` (an array of
 *   `{ product_line, product_tier }`). The `security` line is preferred when
 *   present (e.g. `security_essentials`); otherwise the first entry is used so
 *   that single-line projects like `ai_soc` (`search_ai_lake`) still resolve.
 *   When the arg is absent or unparsable, the implicit `complete` tier is
 *   returned.
 * - `oblt` projects encode the tier in `--pricing.tiers.products` (an array of
 *   `{ name, tier }`); we read the `observability` entry. When the arg is
 *   absent or unparsable, the implicit `complete` tier is returned.
 * - For project types that don't expose a tier today (e.g. `es`,
 *   `workplaceai`), returns `undefined`.
 */
export declare const getProductTier: (kbnServerArgs: string[], projectType: ServerlessProjectType | undefined) => ServerlessProductTier | undefined;
