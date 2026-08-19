import type { Client } from '@elastic/elasticsearch';
export declare const getIndexTemplate: (client: Client, templateName: string) => Promise<{
    index_patterns: import("@elastic/elasticsearch/lib/api/types").Names;
    version?: import("@elastic/elasticsearch/lib/api/types").VersionNumber;
    priority?: import("@elastic/elasticsearch/lib/api/types").long;
    _meta?: import("@elastic/elasticsearch/lib/api/types").Metadata;
    allow_auto_create?: boolean;
    data_stream?: import("@elastic/elasticsearch/lib/api/types").IndicesIndexTemplateDataStreamConfiguration;
    deprecated?: boolean;
    ignore_missing_component_templates?: import("@elastic/elasticsearch/lib/api/types").Names;
    created_date?: import("@elastic/elasticsearch/lib/api/types").DateTime;
    created_date_millis?: import("@elastic/elasticsearch/lib/api/types").EpochTime<import("@elastic/elasticsearch/lib/api/types").UnitMillis>;
    modified_date?: import("@elastic/elasticsearch/lib/api/types").DateTime;
    modified_date_millis?: import("@elastic/elasticsearch/lib/api/types").EpochTime<import("@elastic/elasticsearch/lib/api/types").UnitMillis>;
    name: string;
    template: any;
}>;
