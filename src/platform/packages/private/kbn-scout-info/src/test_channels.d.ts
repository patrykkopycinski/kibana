import type { z } from '@kbn/zod';
export declare const ScoutTestChannelSchema: z.ZodEnum<{
    "ci-batch-3h": "ci-batch-3h";
    "ci-batch-daily": "ci-batch-daily";
    "ci-batch-weekly": "ci-batch-weekly";
    "ci-on-commit": "ci-on-commit";
}>;
export type ScoutTestChannel = z.infer<typeof ScoutTestChannelSchema>;
export type ScoutTestChannelsDefinition = ScoutTestChannel[];
export declare const testChannel: {
    fromString(raw: string): ScoutTestChannel;
};
export declare const testChannels: {
    all: ScoutTestChannel[];
    default: ScoutTestChannel[];
    match(pattern: RegExp): ScoutTestChannel[];
    current(): ScoutTestChannel[];
};
