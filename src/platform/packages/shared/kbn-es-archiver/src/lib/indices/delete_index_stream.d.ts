import { Transform } from 'stream';
import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import type { Stats } from '../stats';
export declare function createDeleteIndexStream(client: Client, stats: Stats, log: ToolingLog): Transform;
