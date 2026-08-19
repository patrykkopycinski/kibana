import type { Client } from '@elastic/elasticsearch';
export declare function deleteDataStream(client: Client, datastream: string, template: string): Promise<void>;
