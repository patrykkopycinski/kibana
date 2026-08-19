import { type ZodSafeParseResult } from '@kbn/zod/v4';
export declare function expectPrettyError(result: ZodSafeParseResult<unknown>): jest.JestMatchers<string>;
