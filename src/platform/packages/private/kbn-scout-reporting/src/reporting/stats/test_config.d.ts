import type { Client as ESClient } from '@elastic/elasticsearch';
import type { z } from '@kbn/zod/v4';
import type { ScoutTestTarget } from '@kbn/scout-info';
export declare const ScoutTestConfigStatsEntrySchema: z.ZodObject<{
    path: z.ZodString;
    test_target: z.ZodPipe<z.ZodObject<{
        location: z.ZodEnum<{
            cloud: "cloud";
            local: "local";
        }>;
        arch: z.ZodEnum<{
            serverless: "serverless";
            stateful: "stateful";
        }>;
        domain: z.ZodEnum<{
            classic: "classic";
            observability_complete: "observability_complete";
            observability_logs_essentials: "observability_logs_essentials";
            search: "search";
            security_complete: "security_complete";
            security_ease: "security_ease";
            security_essentials: "security_essentials";
            vectordb: "vectordb";
            workplaceai: "workplaceai";
        }>;
    }, z.core.$strip>, z.ZodTransform<ScoutTestTarget, {
        location: "cloud" | "local";
        arch: "serverless" | "stateful";
        domain: "classic" | "observability_complete" | "observability_logs_essentials" | "search" | "security_complete" | "security_ease" | "security_essentials" | "vectordb" | "workplaceai";
    }>>;
    runCount: z.ZodInt;
    runtime: z.ZodObject<{
        avg: z.ZodInt;
        median: z.ZodInt;
        pc95th: z.ZodInt;
        pc99th: z.ZodInt;
        max: z.ZodInt;
        estimate: z.ZodInt;
    }, z.core.$strip>;
}, z.core.$strip>;
export type ScoutTestConfigStatsEntry = z.infer<typeof ScoutTestConfigStatsEntrySchema>;
export declare const ScoutTestConfigStatsDataSchema: z.ZodObject<{
    lastUpdated: z.ZodCoercedDate<unknown>;
    lookbackDays: z.ZodInt;
    buildkite: z.ZodObject<{
        branch: z.ZodOptional<z.ZodString>;
        pipeline: z.ZodOptional<z.ZodObject<{
            slug: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    configs: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        test_target: z.ZodPipe<z.ZodObject<{
            location: z.ZodEnum<{
                cloud: "cloud";
                local: "local";
            }>;
            arch: z.ZodEnum<{
                serverless: "serverless";
                stateful: "stateful";
            }>;
            domain: z.ZodEnum<{
                classic: "classic";
                observability_complete: "observability_complete";
                observability_logs_essentials: "observability_logs_essentials";
                search: "search";
                security_complete: "security_complete";
                security_ease: "security_ease";
                security_essentials: "security_essentials";
                vectordb: "vectordb";
                workplaceai: "workplaceai";
            }>;
        }, z.core.$strip>, z.ZodTransform<ScoutTestTarget, {
            location: "cloud" | "local";
            arch: "serverless" | "stateful";
            domain: "classic" | "observability_complete" | "observability_logs_essentials" | "search" | "security_complete" | "security_ease" | "security_essentials" | "vectordb" | "workplaceai";
        }>>;
        runCount: z.ZodInt;
        runtime: z.ZodObject<{
            avg: z.ZodInt;
            median: z.ZodInt;
            pc95th: z.ZodInt;
            pc99th: z.ZodInt;
            max: z.ZodInt;
            estimate: z.ZodInt;
        }, z.core.$strip>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ScoutTestConfigStatsData = z.infer<typeof ScoutTestConfigStatsDataSchema>;
export declare class ScoutTestConfigStats {
    data: ScoutTestConfigStatsData;
    constructor(data: ScoutTestConfigStatsData);
    writeToFile(outputPath: string): void;
    static fromFile(statsFilePath: string): ScoutTestConfigStats;
    static fromElasticsearch(es: ESClient, options: {
        configPaths: string[];
        lookbackDays: number;
        buildkite: {
            branch?: string;
            pipelineSlug?: string;
        };
    }): Promise<ScoutTestConfigStats>;
}
