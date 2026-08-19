import type { EsClient, KbnClient } from '.';
export interface KibanaRole {
    elasticsearch: {
        cluster: string[];
        indices?: Array<{
            names: string[];
            privileges: string[];
            allow_restricted_indices?: boolean | undefined;
        }>;
    };
    kibana: Array<{
        base: string[];
        feature: Record<string, string[]>;
        spaces: string[];
    }>;
}
export interface ElasticsearchRoleDescriptor {
    cluster?: string[];
    indices?: Array<{
        names: string[];
        privileges: string[];
        allow_restricted_indices?: boolean;
    }>;
    applications?: Array<{
        application: string;
        privileges: string[];
        resources: string[];
    }>;
    run_as?: string[];
}
export declare const createCustomRole: (kbnClient: KbnClient, customRoleName: string, role: KibanaRole) => Promise<void>;
export declare const createElasticsearchCustomRole: (client: EsClient, customRoleName: string, role: ElasticsearchRoleDescriptor) => Promise<void>;
export declare const isElasticsearchRole: (role: KibanaRole | ElasticsearchRoleDescriptor) => role is ElasticsearchRoleDescriptor;
